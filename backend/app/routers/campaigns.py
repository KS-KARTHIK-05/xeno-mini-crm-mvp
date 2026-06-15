"""
Campaign Router
===============
Endpoints:
  GET    /api/campaigns              → list all campaigns with stats
  POST   /api/campaigns              → create + launch a campaign
  GET    /api/campaigns/{id}         → single campaign detail + stats
  GET    /api/campaigns/{id}/comms   → communications log (paginated)
  POST   /api/campaigns/preview      → preview segment count (no campaign created)
"""

import asyncio
import uuid
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text

from app.database import get_db, AsyncSessionLocal
from app.models import Campaign, Communication
from app.schemas import (
    CampaignCreate,
    CampaignOut,
    CampaignStatsOut,
    CommunicationOut,
)
from app.segment_engine import evaluate_segment
from app.campaign_dispatcher import dispatch_campaign

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


# ── Preview segment (no campaign created) ────────────────────────────────────

@router.post("/preview")
async def preview_segment(body: dict, db: AsyncSession = Depends(get_db)):
    """
    Preview how many customers match a segment rule set.
    body: { "rules": { "operator": "AND", "conditions": [...] } }
    """
    rules = body.get("rules")
    if not rules:
        raise HTTPException(status_code=400, detail="'rules' field is required")
    try:
        result = await evaluate_segment(rules, db, preview_limit=5)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    from app.schemas import CustomerOut
    return {
        "count": result["count"],
        "sql_preview": result["sql_preview"],
        "sample_customers": [CustomerOut.model_validate(c) for c in result["sample_customers"]],
    }


# ── List campaigns ────────────────────────────────────────────────────────────

@router.get("", response_model=list[CampaignStatsOut])
async def list_campaigns(
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """List campaigns with aggregated stats."""
    # asyncpg cannot infer the type of a nullable param in IS NULL expressions.
    # Branch on whether status filter is active to avoid that.
    if status:
        where_clause = "WHERE c.status = :status"
        params: dict = {"status": status}
    else:
        where_clause = ""
        params = {}

    rows = await db.execute(text(f"""
        SELECT
            c.id,
            c.name,
            c.channel,
            c.status,
            c.audience_size,
            c.created_at,
            c.launched_at,
            c.segment_rules,
            c.message_template,
            c.ai_prompt,
            COALESCE(COUNT(comm.id) FILTER (WHERE comm.status IN ('sent','delivered','read','clicked','converted','failed')), 0) AS total_sent,
            COALESCE(COUNT(comm.id) FILTER (WHERE comm.status IN ('delivered','read','clicked','converted')), 0) AS total_delivered,
            COALESCE(COUNT(comm.id) FILTER (WHERE comm.status IN ('read','clicked','converted')), 0) AS total_read,
            COALESCE(COUNT(comm.id) FILTER (WHERE comm.status IN ('clicked','converted')), 0) AS total_clicked,
            COALESCE(COUNT(comm.id) FILTER (WHERE comm.status = 'failed'), 0) AS total_failed,
            COALESCE(COUNT(comm.id) FILTER (WHERE comm.status = 'converted'), 0) AS total_converted
        FROM campaigns c
        LEFT JOIN communications comm ON comm.campaign_id = c.id
        {where_clause}
        GROUP BY c.id
        ORDER BY c.created_at DESC
    """), params)

    campaigns = []
    for row in rows.mappings():
        d = dict(row)
        total_sent = d["total_sent"] or 0
        total_delivered = d["total_delivered"] or 0
        d["delivery_rate"] = round(total_delivered / total_sent * 100, 1) if total_sent else None
        d["read_rate"] = round(d["total_read"] / total_delivered * 100, 1) if total_delivered else None
        campaigns.append(CampaignStatsOut(**d))
    return campaigns


# ── Get single campaign ───────────────────────────────────────────────────────

@router.get("/{campaign_id}", response_model=CampaignStatsOut)
async def get_campaign(campaign_id: str, db: AsyncSession = Depends(get_db)):
    row = await db.execute(text("""
        SELECT
            c.id, c.name, c.channel, c.status, c.audience_size, c.created_at, c.launched_at,
            c.segment_rules, c.message_template, c.ai_prompt,
            COALESCE(COUNT(comm.id) FILTER (WHERE comm.status IN ('sent','delivered','read','clicked','converted','failed')), 0) AS total_sent,
            COALESCE(COUNT(comm.id) FILTER (WHERE comm.status IN ('delivered','read','clicked','converted')), 0) AS total_delivered,
            COALESCE(COUNT(comm.id) FILTER (WHERE comm.status IN ('read','clicked','converted')), 0) AS total_read,
            COALESCE(COUNT(comm.id) FILTER (WHERE comm.status IN ('clicked','converted')), 0) AS total_clicked,
            COALESCE(COUNT(comm.id) FILTER (WHERE comm.status = 'failed'), 0) AS total_failed,
            COALESCE(COUNT(comm.id) FILTER (WHERE comm.status = 'converted'), 0) AS total_converted
        FROM campaigns c
        LEFT JOIN communications comm ON comm.campaign_id = c.id AND comm.campaign_id = :id
        WHERE c.id = :id
        GROUP BY c.id
    """), {"id": campaign_id})
    
    data = row.mappings().one_or_none()
    if not data:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    d = dict(data)
    total_sent = d["total_sent"] or 0
    total_delivered = d["total_delivered"] or 0
    d["delivery_rate"] = round(total_delivered / total_sent * 100, 1) if total_sent else None
    d["read_rate"] = round(d["total_read"] / total_delivered * 100, 1) if total_delivered else None
    return CampaignStatsOut(**d)


# ── Get campaign communications log ──────────────────────────────────────────

@router.get("/{campaign_id}/comms", response_model=list[CommunicationOut])
async def get_campaign_comms(
    campaign_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(Communication).where(Communication.campaign_id == campaign_id)
    if status:
        q = q.where(Communication.status == status)
    q = q.order_by(Communication.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(q)
    comms = result.scalars().all()
    return [CommunicationOut.model_validate(c) for c in comms]


# ── Create and launch a campaign ─────────────────────────────────────────────

@router.post("", response_model=CampaignOut, status_code=201)
async def create_campaign(
    body: CampaignCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Create a campaign and immediately launch it in the background.
    Returns the campaign record right away (status=launching).
    """
    # Validate segment rules by doing a quick preview
    try:
        preview = await evaluate_segment(body.segment_rules, db, preview_limit=0)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid segment rules: {exc}")
    except Exception as exc:
        log.exception("Segment evaluation failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Segment evaluation error: {exc}")

    # Create the campaign row
    try:
        campaign = Campaign(
            id=uuid.uuid4(),
            name=body.name,
            segment_rules=body.segment_rules,
            message_template=body.message_template,
            channel=body.channel,
            status="draft",
            audience_size=preview["count"],
            ai_prompt=body.ai_prompt,
        )
        db.add(campaign)
        await db.commit()
        await db.refresh(campaign)
    except Exception as exc:
        await db.rollback()
        log.exception("Campaign DB insert failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Database error creating campaign: {exc}")

    log.info("Campaign created: %s (%s) — audience=%d", campaign.name, campaign.id, campaign.audience_size)

    # Launch dispatch in background (after response is sent)
    campaign_id_str = str(campaign.id)
    background_tasks.add_task(dispatch_campaign, campaign_id_str, AsyncSessionLocal)

    return CampaignOut.model_validate(campaign)
