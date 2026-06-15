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
            log.warning("Failed to send comm %s: %s", comm.id, exc)
            async with session_factory() as db:
                await db.execute(
                    update(Communication)
                    .where(Communication.id == comm.id)
                    .values(status="failed", failed_at=datetime.now(timezone.utc))
                )
                await db.commit()


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
