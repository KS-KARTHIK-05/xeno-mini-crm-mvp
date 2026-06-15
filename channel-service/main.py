"""
Channel Service Stub
====================
Simulates a real messaging channel (WhatsApp / SMS / Email).

POST /send  → accepts a message payload
            → waits a random delay (0.5–4s)
            → POSTs a delivery receipt back to the CRM

Outcome probabilities per channel
  whatsapp : 92% delivered → 68% read → 30% clicked → 12% converted
  sms      : 85% delivered → 40% read → 15% clicked →  6% converted
  email    : 78% delivered → 35% read → 22% clicked → 10% converted
  rcs      : 90% delivered → 60% read → 28% clicked → 11% converted
"""

import asyncio
import logging
import os
import random
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [channel] %(message)s")
log = logging.getLogger(__name__)

# ── Config ──────────────────────────────────────────────────────────────────

CRM_RECEIPT_URL = os.getenv("CRM_RECEIPT_URL", "http://localhost:8000/api/receipts")

CHANNEL_RATES = {
    "whatsapp": {"deliver": 0.92, "read": 0.68, "click": 0.30, "convert": 0.12},
    "sms":      {"deliver": 0.85, "read": 0.40, "click": 0.15, "convert": 0.06},
    "email":    {"deliver": 0.78, "read": 0.35, "click": 0.22, "convert": 0.10},
    "rcs":      {"deliver": 0.90, "read": 0.60, "click": 0.28, "convert": 0.11},
}
DEFAULT_RATES = CHANNEL_RATES["whatsapp"]

# ── Schemas ──────────────────────────────────────────────────────────────────

class SendPayload(BaseModel):
    communication_id: str
    customer_id: str
    channel: str
    message: str
    recipient: str          # phone / email


class ReceiptPayload(BaseModel):
    communication_id: str
    status: str
    timestamp: str


# ── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Xeno Channel Service",
    description="Stub messaging channel — simulates delivery receipts",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Background task ──────────────────────────────────────────────────────────

async def _simulate_and_callback(payload: SendPayload):
    """Simulate delivery pipeline and fire receipt callbacks back to CRM."""
    rates = CHANNEL_RATES.get(payload.channel.lower(), DEFAULT_RATES)
    comm_id = payload.communication_id

    # ── sent ───────────────────────────────────────────────────────────
    await asyncio.sleep(random.uniform(0.3, 1.2))
    await _post_receipt(comm_id, "sent")

    # ── delivered / failed ─────────────────────────────────────────────
    await asyncio.sleep(random.uniform(0.5, 3.0))
    if random.random() > rates["deliver"]:
        await _post_receipt(comm_id, "failed")
        log.info("comm %s → FAILED", comm_id)
        return

    await _post_receipt(comm_id, "delivered")
    log.info("comm %s → delivered", comm_id)

    # ── read ───────────────────────────────────────────────────────────
    await asyncio.sleep(random.uniform(1.0, 8.0))
    if random.random() > rates["read"]:
        return

    await _post_receipt(comm_id, "read")
    log.info("comm %s → read", comm_id)

    # ── clicked ────────────────────────────────────────────────────────
    await asyncio.sleep(random.uniform(2.0, 10.0))
    if random.random() > rates["click"]:
        return

    await _post_receipt(comm_id, "clicked")
    log.info("comm %s → clicked", comm_id)

    # ── converted ──────────────────────────────────────────────────────
    await asyncio.sleep(random.uniform(5.0, 20.0))
    if random.random() > rates["convert"]:
        return

    await _post_receipt(comm_id, "converted")
    log.info("comm %s → converted", comm_id)


async def _post_receipt(communication_id: str, status: str):
    """Fire-and-forget HTTP POST to the CRM receipt webhook."""
    payload = {
        "communication_id": communication_id,
        "status": status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(CRM_RECEIPT_URL, json=payload)
            if resp.status_code not in (200, 201, 204):
                log.warning("Receipt for %s/%s got HTTP %s", communication_id, status, resp.status_code)
    except Exception as exc:
        log.error("Failed to POST receipt for %s/%s: %s", communication_id, status, exc)


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "channel-service"}


@app.post("/send", status_code=202)
async def send_message(payload: SendPayload):
    """
    Accept a message send request.
    Returns immediately (202 Accepted) and fires delivery simulation in background.
    """
    if not payload.communication_id:
        raise HTTPException(status_code=400, detail="communication_id is required")

    log.info("send  comm_id=%s  channel=%s  to=%s", payload.communication_id, payload.channel, payload.recipient)
    asyncio.create_task(_simulate_and_callback(payload))
    return {"accepted": True, "communication_id": payload.communication_id}
