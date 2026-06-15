"""
Copilot Router
==============
The AI-native Campaign Copilot endpoint.

POST /api/copilot/chat
  → Accepts a user message + optional session state
  → Calls Gemini to parse intent / generate messages
  → Returns a structured response the frontend renders as a "card"

Conversation flow (stateless — state lives in the frontend):
  Step 1 — USER sends a natural language goal
            COPILOT parses intent, evaluates segment, returns preview card
  Step 2 — USER confirms (or edits message) and sends back campaign_data
            COPILOT generates the final message template, returns draft card
  Step 3 — USER clicks "Launch"
            COPILOT creates the campaign and returns success card

POST /api/copilot/suggest
  → Given partial text, return quick-start prompt suggestions (no Gemini call)
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, AsyncSessionLocal
from app.schemas import CampaignCreate, CustomerOut, CopilotResponse, SegmentPreview
from app.segment_engine import evaluate_segment
from app.services.gemini_service import parse_campaign_intent, generate_campaign_message
from app.ws_manager import manager as ws_manager

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/copilot", tags=["copilot"])


# ── Request / Response schemas ───────────────────────────────────────────────

class CopilotChatRequest(BaseModel):
    message: Optional[str] = ""          # Empty on steps 2 & 3
    confirmed_intent: Optional[dict] = None
    confirmed_message: Optional[str] = None


class CopilotChatResponse(BaseModel):
    type: str          # intent_parsed | segment_preview | message_draft | campaign_launched | error | info
    text: str          # Human-readable copilot reply
    # Optional rich payloads (only set when relevant)
    segment_preview: Optional[dict] = None
    message_draft: Optional[str] = None
    subject_line: Optional[str] = None
    campaign_data: Optional[dict] = None   # ready-to-POST to /api/campaigns
    campaign_id: Optional[str] = None      # set after launch


# ── Quick suggestions (no AI call) ──────────────────────────────────────────

QUICK_SUGGESTIONS = [
    "Find VIP customers who haven't bought in 60 days and send them a WhatsApp exclusive access message",
    "Re-engage at-risk customers with a 15% off email offer",
    "Send a WhatsApp thank-you message to customers who spent over ₹50,000",
    "Find customers from Mumbai and Delhi and SMS them about our new collection",
    "Target new customers with an email welcoming them and offering free shipping",
    "Send a loyalty reward WhatsApp message to customers with more than 5 orders",
]

@router.get("/suggestions")
async def get_suggestions():
    """Return quick-start prompt suggestions for the UI."""
    return {"suggestions": QUICK_SUGGESTIONS}


# ── Main chat endpoint ───────────────────────────────────────────────────────

@router.post("/chat", response_model=CopilotChatResponse)
async def copilot_chat(
    body: CopilotChatRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    The main copilot endpoint.

    Handles 3 types of requests based on what's in the body:

    1. Fresh NL message (no confirmed_intent):
       → Parse intent with Gemini → evaluate segment → return preview card

    2. Confirmed intent + no confirmed_message:
       → Generate message with Gemini → return message draft card

    3. Confirmed intent + confirmed message:
       → Create the campaign → return launch success card
    """
    msg = body.message.strip()

    # ── STEP 3: Launch confirmed campaign ────────────────────────────────────
    if body.confirmed_intent and body.confirmed_message:
        return await _handle_launch(body.confirmed_intent, body.confirmed_message, db)

    # ── STEP 2: Generate message for confirmed segment ───────────────────────
    if body.confirmed_intent and not body.confirmed_message:
        return await _handle_message_generation(body.confirmed_intent, db)

    # ── STEP 1: Parse fresh NL intent ────────────────────────────────────────
    return await _handle_intent_parse(msg, db)


# ── Step handlers ─────────────────────────────────────────────────────────────

async def _handle_intent_parse(message: str, db: AsyncSession) -> CopilotChatResponse:
    """Parse NL → segment rules → evaluate → return preview."""

    # Call Gemini
    intent = await parse_campaign_intent(message)

    if not intent.get("understood", False):
        return CopilotChatResponse(
            type="info",
            text=intent.get("copilot_comment", "I didn't understand that. Could you rephrase?"),
        )

    # Evaluate the segment
    rules = intent.get("segment_rules", {})
    try:
        result = await evaluate_segment(rules, db, preview_limit=3)
    except ValueError as exc:
        return CopilotChatResponse(
            type="error",
            text=f"I understood your goal but the segment rules had an issue: {exc}. Could you rephrase?",
        )

    count = result["count"]
    sample = [CustomerOut.model_validate(c) for c in result["sample_customers"]]
    sql_preview = result["sql_preview"]

    # Build a friendly reply
    channel = intent.get("channel", "whatsapp")
    campaign_name = intent.get("campaign_name", "New Campaign")
    offer = intent.get("offer")

    if count == 0:
        reply = (
            f"I understood your goal — **{campaign_name}** via {channel.upper()}. "
            f"However, **no customers** match this segment right now. "
            f"Try broadening the criteria (e.g., increase the spend threshold or time window)."
        )
        return CopilotChatResponse(type="info", text=reply)

    reply = (
        f"Got it! Here's what I found for **{campaign_name}**:\n\n"
        f"📊 **{count} customers** match your segment via {channel.upper()}."
        + (f"\n🎁 Offer: {offer}" if offer else "")
        + f"\n\n💬 _{intent.get('copilot_comment', '')}_"
        + f"\n\nWant me to draft the {channel} message for this audience?"
    )

    return CopilotChatResponse(
        type="segment_preview",
        text=reply,
        segment_preview={
            "rules": rules,
            "sql_preview": sql_preview,
            "count": count,
            "sample_customers": [c.model_dump() for c in sample],
        },
        campaign_data={
            "name": campaign_name,
            "channel": channel,
            "segment_rules": rules,
            "offer": offer,
            "message_goal": intent.get("message_goal", ""),
            "ai_prompt": message,
        },
    )


async def _handle_message_generation(intent: dict, db: AsyncSession) -> CopilotChatResponse:
    """Generate a personalized message draft for the confirmed segment."""

    # Re-evaluate segment for current count
    rules = intent.get("segment_rules", {})
    try:
        result = await evaluate_segment(rules, db, preview_limit=0)
        count = result["count"]
    except Exception:
        count = intent.get("audience_size", 0)

    channel = intent.get("channel", "whatsapp")
    message_goal = intent.get("message_goal", "")
    offer = intent.get("offer")
    campaign_name = intent.get("name", intent.get("campaign_name", "Campaign"))

    # Build segment description for Gemini
    conditions = rules.get("conditions", [])
    segment_desc_parts = []
    for c in conditions:
        f, op, v = c.get("field"), c.get("op"), c.get("value")
        if op == "days_ago":
            segment_desc_parts.append(f"haven't purchased in {v}+ days")
        elif f == "total_spend":
            segment_desc_parts.append(f"spent {'over' if op in ('gt','gte') else 'under'} ₹{v:,}")
        elif f == "tags":
            segment_desc_parts.append(f"tagged as '{v}'")
        elif f == "city":
            segment_desc_parts.append(f"from {v}")
        elif f == "order_count":
            segment_desc_parts.append(f"with {op} {v} orders")
    segment_desc = ", ".join(segment_desc_parts) if segment_desc_parts else "selected customers"

    # Call Gemini for message
    gen = await generate_campaign_message(
        channel=channel,
        message_goal=message_goal,
        segment_description=segment_desc,
        offer=offer,
        audience_size=count,
    )

    template = gen.get("message_template", "")
    subject = gen.get("subject_line")
    note = gen.get("copywriter_note", "")

    reply = (
        f"Here's your {channel.upper()} message draft for **{count} customers**:\n\n"
        f"> {template}\n\n"
        + (f"📧 Subject: _{subject}_\n\n" if subject else "")
        + f"✍️ _{note}_\n\n"
        f"**Ready to launch?** You can edit the message above, then confirm."
    )

    return CopilotChatResponse(
        type="message_draft",
        text=reply,
        message_draft=template,
        subject_line=subject,
        campaign_data={
            "name": campaign_name,
            "channel": channel,
            "segment_rules": rules,
            "message_goal": message_goal,
            "offer": offer,
            "audience_size": count,
            "ai_prompt": intent.get("ai_prompt", ""),
        },
    )


async def _handle_launch(intent: dict, message_template: str, db: AsyncSession) -> CopilotChatResponse:
    """Create and dispatch the campaign."""
    import asyncio
    from app.schemas import CampaignCreate
    from app.campaign_dispatcher import dispatch_campaign

    campaign_name = intent.get("name", intent.get("campaign_name", "AI Campaign"))
    channel       = intent.get("channel", "whatsapp")
    rules         = intent.get("segment_rules", {})
    ai_prompt     = intent.get("ai_prompt", "")

    body = CampaignCreate(
        name=campaign_name,
        segment_rules=rules,
        message_template=message_template,
        channel=channel,
        ai_prompt=ai_prompt,
    )

    try:
        # Import inline to avoid circular at module level
        from app.routers.campaigns import create_campaign
        from fastapi import BackgroundTasks

        # Create campaign record (inserts into Supabase)
        bg = BackgroundTasks()
        campaign_out = await create_campaign(body, bg, db)

        # ✅ Use asyncio.create_task so dispatch runs in the background
        # without blocking the current request / DB session
        asyncio.create_task(dispatch_campaign(str(campaign_out.id), AsyncSessionLocal))

        reply = (
            f"🚀 **Campaign launched!**\n\n"
            f"**{campaign_name}** is now dispatching to **{campaign_out.audience_size} customers** "
            f"via {channel.upper()}.\n\n"
            f"Track live delivery stats in the canvas dashboard. "
            f"Receipts will stream in over the next few minutes."
        )

        return CopilotChatResponse(
            type="campaign_launched",
            text=reply,
            campaign_id=str(campaign_out.id),
            campaign_data={
                "id":            str(campaign_out.id),
                "name":          campaign_out.name,
                "channel":       campaign_out.channel,
                "audience_size": campaign_out.audience_size,
                "status":        campaign_out.status,
            },
        )
    except Exception as exc:
        log.exception("Campaign launch failed: %s", exc)
        return CopilotChatResponse(
            type="error",
            text=f"Campaign creation failed: {exc}. Please try again.",
        )


@router.get("/ping")
async def ping():
    """Quick check that copilot router is wired up."""
    return {
        "status": "copilot online",
        "model": "gemini-2.5-flash",
        "ws_clients": ws_manager.connection_count,
    }


# ── WebSocket: Real-time delivery feed ───────────────────────────────────────

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Frontend connects here to receive real-time delivery events.
    Events are broadcast by the receipts router whenever a status update arrives.
    """
    await ws_manager.connect(websocket)
    try:
        # Keep alive — we only push from server (receipts broadcast)
        while True:
            # Accept pings from client (e.g. keep-alive messages)
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)
