"""
Receipt Router
==============
Webhook endpoint called by the Channel Service to report delivery outcomes.

POST /api/receipts
  Body: { communication_id, status, timestamp }
  Valid statuses: sent | delivered | read | clicked | converted | failed
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import update, select

from app.database import get_db
from app.models import Communication, Customer
from app.schemas import ReceiptPayload
from app.ws_manager import manager as ws_manager

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/receipts", tags=["receipts"])

# Status → column name mapping
STATUS_COLUMN = {
    "sent":       "sent_at",
    "delivered":  "delivered_at",
    "read":       "read_at",
    "clicked":    "clicked_at",
    "converted":  "converted_at",
    "failed":     "failed_at",
}


@router.post("", status_code=204)
async def ingest_receipt(
    payload: ReceiptPayload,
    db: AsyncSession = Depends(get_db),
):
    """
    Ingests a delivery receipt from the Channel Service.
    Updates the Communication row's status and the corresponding timestamp column.
    Returns 204 No Content on success.
    """
    status = payload.status.lower()
    col = STATUS_COLUMN.get(status)
    if not col:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid status '{status}'. Must be one of: {', '.join(STATUS_COLUMN)}"
        )

    # Build dynamic update values
    ts = payload.timestamp if isinstance(payload.timestamp, datetime) else datetime.now(timezone.utc)
    values = {"status": status, col: ts}

    result = await db.execute(
        update(Communication)
        .where(Communication.id == payload.communication_id)
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
        log.warning("Receipt for unknown communication_id: %s", payload.communication_id)
        await db.commit()
        return

    await db.commit()
    log.info("Receipt: comm=%s → %s", payload.communication_id, status)

    # ── Broadcast to connected WebSocket clients ──────────────────────────────
    try:
        # Optionally enrich with customer name/city for the live feed
        cust_row = await db.execute(
            select(Customer.name, Customer.city)
            .where(Customer.id == row.customer_id)
        )
        cust = cust_row.fetchone()
        await ws_manager.broadcast({
            "type":             "delivery_event",
            "campaign_id":      str(row.campaign_id),
            "communication_id": str(payload.communication_id),
            "customer_name":    cust.name  if cust else "—",
            "customer_city":    cust.city  if cust else "",
            "channel":          row.channel,
            "status":           status,
            "timestamp":        ts.isoformat(),
        })
    except Exception as exc:
        log.warning("WS broadcast failed: %s", exc)
    # 204 → no body
