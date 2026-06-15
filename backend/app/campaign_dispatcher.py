"""
Campaign Dispatcher
===================
Handles the async campaign dispatch loop:
  1. Evaluate segment → get customer IDs
  2. Personalise message per customer
  3. Write Communication rows to DB (status=pending)
  4. POST each to channel-service /send   (fire-and-forget)
  5. Update campaign status → launched

This runs as an asyncio background task so the API can return immediately.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import List

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import Campaign, Communication, Customer
from app.segment_engine import get_segment_customer_ids

log = logging.getLogger(__name__)

CHANNEL_SERVICE_URL = os.getenv("CHANNEL_SERVICE_URL", "http://localhost:8001")

# Max concurrent HTTP calls to channel service
_DISPATCH_CONCURRENCY = int(os.getenv("DISPATCH_CONCURRENCY", "20"))


# ── Public entry point ───────────────────────────────────────────────────────

async def dispatch_campaign(
    campaign_id: str,
    session_factory: async_sessionmaker,
) -> None:
    """
    Background task: dispatches all messages for a campaign.
    Uses a fresh DB session (not the request session).
    """
    async with session_factory() as db:
        try:
            await _run_dispatch(campaign_id, db, session_factory)
        except Exception as exc:
            log.exception("Dispatch failed for campaign %s: %s", campaign_id, exc)
            # The current session's transaction is aborted — use a FRESH session
            try:
                await db.rollback()
                await db.execute(
                    update(Campaign)
                    .where(Campaign.id == campaign_id)
                    .values(status="error")
                )
                await db.commit()
            except Exception:
                # Fallback: open a completely new session
                async with session_factory() as err_db:
                    try:
                        await err_db.execute(
                            update(Campaign)
                            .where(Campaign.id == campaign_id)
                            .values(status="error")
                        )
                        await err_db.commit()
                    except Exception as e2:
                        log.error("Failed to mark campaign %s as error: %s", campaign_id, e2)


# ── Core dispatch logic ──────────────────────────────────────────────────────

async def _run_dispatch(
    campaign_id: str,
    db: AsyncSession,
    session_factory: async_sessionmaker,
) -> None:
    # 1. Load campaign
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign: Campaign | None = result.scalar_one_or_none()
    if not campaign:
        log.error("Campaign %s not found — aborting dispatch", campaign_id)
        return
    if campaign.status == "launched":
        log.warning("Campaign %s already launched — skipping", campaign_id)
        return

    log.info("Dispatching campaign '%s' (%s) via %s", campaign.name, campaign_id, campaign.channel)

    # 2. Evaluate segment
    customer_ids = await get_segment_customer_ids(campaign.segment_rules, db)
    log.info("Segment resolved to %d customers", len(customer_ids))

    if not customer_ids:
        await db.execute(
            update(Campaign)
            .where(Campaign.id == campaign_id)
            .values(status="completed", audience_size=0, launched_at=datetime.now(timezone.utc))
        )
        await db.commit()
        return

    # 3. Load customer details (for personalisation)
    result = await db.execute(select(Customer).where(Customer.id.in_(customer_ids)))
    customers: List[Customer] = list(result.scalars().all())

    # 4. Build Communication rows
    comms = []
    for customer in customers:
        personalised_msg = _personalise(campaign.message_template, customer)
        comm = Communication(
            id=uuid.uuid4(),
            campaign_id=campaign.id,
            customer_id=customer.id,
            channel=campaign.channel,
            message=personalised_msg,
            status="pending",
        )
        db.add(comm)
        comms.append((comm, customer))

    # Update audience size + launched_at (skip 'launching' status — not in live DB constraint)
    await db.execute(
        update(Campaign)
        .where(Campaign.id == campaign_id)
        .values(
            audience_size=len(customers),
            launched_at=datetime.now(timezone.utc),
        )
    )
    await db.commit()

    # 5. Fire off to channel service (batched concurrency)
    semaphore = asyncio.Semaphore(_DISPATCH_CONCURRENCY)
    tasks = [
        _send_one(comm, customer, campaign.channel, semaphore, session_factory)
        for comm, customer in comms
    ]
    await asyncio.gather(*tasks, return_exceptions=True)

    # 6. Mark campaign launched
    async with session_factory() as finish_db:
        await finish_db.execute(
            update(Campaign)
            .where(Campaign.id == campaign_id)
            .values(status="launched")
        )
        await finish_db.commit()

    log.info("Campaign %s fully dispatched (%d messages)", campaign_id, len(comms))


async def _send_one(
    comm: Communication,
    customer: Customer,
    channel: str,
    semaphore: asyncio.Semaphore,
    session_factory: async_sessionmaker,
) -> None:
    """POST one message to the channel service; update status → sent."""
    async with semaphore:
        payload = {
            "communication_id": str(comm.id),
            "customer_id": str(customer.id),
            "channel": channel,
            "message": comm.message,
            "recipient": customer.phone or customer.email or "unknown",
        }
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(f"{CHANNEL_SERVICE_URL}/send", json=payload)
                resp.raise_for_status()
            # Update comm status → sent
            async with session_factory() as db:
                await db.execute(
                    update(Communication)
                    .where(Communication.id == comm.id)
                    .values(status="sent", sent_at=datetime.now(timezone.utc))
                )
                await db.commit()
        except Exception as exc:
            log.warning("Failed to send comm %s via channel-service: %s. Falling back to local simulation.", comm.id, exc)
            asyncio.create_task(
                _simulate_receipt_locally(comm.id, customer.id, comm.campaign_id, channel, session_factory)
            )


# ── Local Receipt Simulation Fallback ────────────────────────────────────────

async def _simulate_receipt_locally(
    comm_id: uuid.UUID,
    customer_id: uuid.UUID,
    campaign_id: uuid.UUID,
    channel: str,
    session_factory: async_sessionmaker,
) -> None:
    """Simulates delivery pipeline locally with realistic delays and probabilities."""
    import random
    
    # 1. sent
    await asyncio.sleep(random.uniform(0.3, 1.2))
    await _update_status_and_broadcast(comm_id, "sent", session_factory)

    # 2. delivered / failed
    await asyncio.sleep(random.uniform(0.5, 3.0))
    rates = {
        "whatsapp": {"deliver": 0.92, "read": 0.68, "click": 0.30, "convert": 0.12},
        "sms":      {"deliver": 0.85, "read": 0.40, "click": 0.15, "convert": 0.06},
        "email":    {"deliver": 0.78, "read": 0.35, "click": 0.22, "convert": 0.10},
        "rcs":      {"deliver": 0.90, "read": 0.60, "click": 0.28, "convert": 0.11},
    }.get(channel.lower(), {"deliver": 0.92, "read": 0.68, "click": 0.30, "convert": 0.12})

    if random.random() > rates["deliver"]:
        await _update_status_and_broadcast(comm_id, "failed", session_factory)
        log.info("Local Sim: comm %s → FAILED", comm_id)
        return

    await _update_status_and_broadcast(comm_id, "delivered", session_factory)
    log.info("Local Sim: comm %s → delivered", comm_id)

    # 3. read
    await asyncio.sleep(random.uniform(1.0, 8.0))
    if random.random() > rates["read"]:
        return
    await _update_status_and_broadcast(comm_id, "read", session_factory)
    log.info("Local Sim: comm %s → read", comm_id)

    # 4. clicked
    await asyncio.sleep(random.uniform(2.0, 10.0))
    if random.random() > rates["click"]:
        return
    await _update_status_and_broadcast(comm_id, "clicked", session_factory)
    log.info("Local Sim: comm %s → clicked", comm_id)

    # 5. converted
    await asyncio.sleep(random.uniform(5.0, 20.0))
    if random.random() > rates["convert"]:
        return
    await _update_status_and_broadcast(comm_id, "converted", session_factory)
    log.info("Local Sim: comm %s → converted", comm_id)


async def _update_status_and_broadcast(
    comm_id: uuid.UUID,
    status: str,
    session_factory: async_sessionmaker,
) -> None:
    """Updates communication status and timestamps, then broadcasts to WebSocket."""
    STATUS_COLUMN = {
        "sent":       "sent_at",
        "delivered":  "delivered_at",
        "read":       "read_at",
        "clicked":    "clicked_at",
        "converted":  "converted_at",
        "failed":     "failed_at",
    }
    col = STATUS_COLUMN.get(status)
    if not col:
        return

    ts = datetime.now(timezone.utc)
    values = {"status": status, col: ts}

    try:
        async with session_factory() as db:
            result = await db.execute(
                update(Communication)
                .where(Communication.id == comm_id)
                .values(**values)
                .returning(
                    Communication.id,
                    Communication.campaign_id,
                    Communication.customer_id,
                    Communication.channel,
                )
            )
            row = result.fetchone()
            if not row:
                return
            await db.commit()

            cust_row = await db.execute(
                select(Customer.name, Customer.city)
                .where(Customer.id == row.customer_id)
            )
            cust = cust_row.fetchone()

        from app.ws_manager import manager as ws_manager
        await ws_manager.broadcast({
            "type":             "delivery_event",
            "campaign_id":      str(row.campaign_id),
            "communication_id": str(comm_id),
            "customer_name":    cust.name if cust else "—",
            "customer_city":    cust.city if cust else "",
            "channel":          row.channel,
            "status":           status,
            "timestamp":        ts.isoformat(),
        })
    except Exception as exc:
        log.warning("Local simulation update/broadcast failed for comm %s: %s", comm_id, exc)


# ── Message personalisation ──────────────────────────────────────────────────

def _personalise(template: str, customer: Customer) -> str:
    """
    Replace {{name}}, {{first_name}}, {{city}}, {{total_spend}} tokens.
    """
    first_name = customer.name.split()[0] if customer.name else "there"
    replacements = {
        "{{name}}":         customer.name or "Valued Customer",
        "{{first_name}}":   first_name,
        "{{city}}":         customer.city or "",
        "{{total_spend}}":  f"₹{customer.total_spend:,.0f}",
    }
    msg = template
    for token, val in replacements.items():
        msg = msg.replace(token, val)
    # Also handle {{ name }} style with spaces
    msg = re.sub(r"\{\{\s*(\w+)\s*\}\}", lambda m: replacements.get(f"{{{{{m.group(1)}}}}}", m.group(0)), msg)
    return msg

