"""
Gemini AI Service
=================
Wraps the Google Generative AI SDK to power the Campaign Copilot.

Has TWO layers:
  1. Gemini AI — best quality when quota is available
  2. Rule-based parser — guaranteed fallback when quota is exhausted or key missing

This means the copilot ALWAYS works, regardless of API limits.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Optional

import google.generativeai as genai
from app.config import get_settings

log = logging.getLogger(__name__)

# ── Model fallback chain (each has its own free-tier quota) ─────────────────
# The AQ. key format only supports Gemini 2.x models.
# 20 req/day per model on free tier.
MODEL_CHAIN = [
    "gemini-2.5-flash",   # newest — try first
    "gemini-2.0-flash",   # separate quota
]
_models: dict = {}


def _get_model(name: str) -> genai.GenerativeModel:
    if name not in _models:
        settings = get_settings()
        genai.configure(api_key=settings.gemini_api_key)
        _models[name] = genai.GenerativeModel(
            model_name=name,
            generation_config=genai.GenerationConfig(
                temperature=0.3,
                response_mime_type="application/json",
            ),
        )
        log.info("Gemini model ready: %s", name)
    return _models[name]


async def _generate_with_fallback(prompt: str) -> str:
    """Try each model in the fallback chain until one succeeds."""
    last_exc = None
    for model_name in MODEL_CHAIN:
        try:
            model = _get_model(model_name)
            log.info("Trying model: %s", model_name)
            response = await model.generate_content_async(prompt)
            log.info("Success with model: %s", model_name)
            return response.text.strip()
        except Exception as exc:
            err_str = str(exc)
            is_recoverable = (
                "429" in err_str
                or "404" in err_str
                or "quota" in err_str.lower()
                or "RESOURCE_EXHAUSTED" in err_str
                or "NOT_FOUND" in err_str
                or "not found" in err_str.lower()
            )
            if is_recoverable:
                log.warning("Model %s unavailable (%s), trying next...",
                            model_name, exc.__class__.__name__)
                last_exc = exc
                continue
            raise  # non-recoverable — propagate immediately
    raise last_exc


# ── Brand Context ────────────────────────────────────────────────────────────

BRAND_CONTEXT = """
You are the AI Copilot for a premium Indian D2C fashion brand.
The brand sells ethnic wear, western fusion, and accessories.
Customers are spread across major Indian metros. Currency is INR (₹).
The CRM has customer records with realistic purchase history.
Tone: warm, aspirational, slightly luxurious — never pushy or spammy.
"""

# ── Prompt 1: Intent Parsing ─────────────────────────────────────────────────

INTENT_PARSE_PROMPT = """
{brand_context}

A marketer typed this request:
"{user_message}"

Parse this into a structured campaign intent. Return ONLY valid JSON matching this exact schema:

{{
  "understood": true,
  "campaign_name": "<short descriptive name>",
  "channel": "<whatsapp|sms|email|rcs>",
  "segment_rules": {{
    "operator": "<AND|OR>",
    "conditions": [
      {{
        "field": "<field_name>",
        "op": "<operator>",
        "value": <value>
      }}
    ]
  }},
  "message_goal": "<one-sentence description of what the message should achieve>",
  "offer": "<specific offer if any, else null>",
  "copilot_comment": "<friendly one-line explanation of what you understood>"
}}

Available segment fields and operators:
  Fields: total_spend (numeric), order_count (integer), last_order_date (datetime),
          city (string), tags (array: vip, at-risk, new, loyal, lapsed),
          name (string), email (string)

  Operators:
    Numeric/Date: gt, gte, lt, lte, eq
    String: eq, contains, in (pass array as value)
    Array (tags): contains (single tag string as value)
    Special: days_ago (use for "haven't purchased in X days" — field=last_order_date, op=days_ago, value=<number>)

  Channel defaults: if not specified, use whatsapp.

Examples:
  "customers who spent over 5000" → {{"field": "total_spend", "op": "gte", "value": 5000}}
  "haven't bought in 90 days" → {{"field": "last_order_date", "op": "days_ago", "value": 90}}
  "VIP customers" → {{"field": "tags", "op": "contains", "value": "vip"}}
  "at-risk customers" → {{"field": "tags", "op": "contains", "value": "at-risk"}}
  "customers from Mumbai or Delhi" → {{"field": "city", "op": "in", "value": ["Mumbai", "Delhi"]}}
  "customers with more than 5 orders" → {{"field": "order_count", "op": "gte", "value": 5}}

IMPORTANT: Be generous in interpretation. If the request is remotely campaign-related,
set "understood": true. Only set "understood": false for completely off-topic requests.
"""

# ── Prompt 2: Message Generation ─────────────────────────────────────────────

MESSAGE_GEN_PROMPT = """
{brand_context}

Write a {channel} marketing message for the following campaign:

Campaign goal: {message_goal}
Target segment: {segment_description}
Offer/incentive: {offer}
Audience size: {audience_size} customers

Requirements:
- Use {{{{first_name}}}} placeholder where you would address the customer by name
- For WhatsApp/RCS: use emoji sparingly (1-2 max), keep under 300 chars
- For SMS: strictly under 160 chars, no emoji
- For Email: can be slightly longer (2-3 short paragraphs), with a clear CTA
- Include the specific offer prominently if one exists

Return ONLY valid JSON:
{{
  "message_template": "<the message with {{{{first_name}}}} placeholder>",
  "subject_line": "<email subject if channel=email, else null>",
  "copywriter_note": "<one line on the tone/approach taken>"
}}
"""


# ── Rule-based fallback parser ────────────────────────────────────────────────

def _rule_based_parse(user_message: str) -> dict:
    """
    Local rule-based intent parser — guaranteed to work when Gemini quota is exhausted.
    Uses regex + keyword matching to extract segment rules from natural language.
    """
    msg = user_message.lower()

    # ── Channel detection ──
    channel = "whatsapp"
    if "email" in msg:   channel = "email"
    elif "sms" in msg:   channel = "sms"
    elif "rcs" in msg:   channel = "rcs"

    # ── Segment conditions ──
    conditions = []

    # Tag-based
    if "vip" in msg:
        conditions.append({"field": "tags", "op": "contains", "value": "vip"})
    if "at-risk" in msg or "at risk" in msg:
        conditions.append({"field": "tags", "op": "contains", "value": "at-risk"})
    if "loyal" in msg:
        conditions.append({"field": "tags", "op": "contains", "value": "loyal"})
    if "new customer" in msg or "new user" in msg or "new buyer" in msg:
        conditions.append({"field": "tags", "op": "contains", "value": "new"})
    if "lapsed" in msg or "inactive" in msg:
        conditions.append({"field": "tags", "op": "contains", "value": "lapsed"})

    # Days since last purchase
    days_m = re.search(r"(\d+)\s*days?", msg)
    if days_m:
        conditions.append({"field": "last_order_date", "op": "days_ago", "value": int(days_m.group(1))})

    # Total spend
    spend_m = re.search(r"(?:spend|spent|purchase|bought)[^\d]*?(\d[\d,]*)", msg)
    if spend_m:
        amt = int(spend_m.group(1).replace(",", ""))
        op = "gte" if any(w in msg for w in ["over", "more than", "above", "greater"]) else "lte"
        conditions.append({"field": "total_spend", "op": op, "value": amt})

    # Order count
    order_m = re.search(r"(\d+)\s*orders?", msg)
    if order_m:
        n = int(order_m.group(1))
        op = "gte" if any(w in msg for w in ["more than", "over", "above"]) else "lte"
        conditions.append({"field": "order_count", "op": op, "value": n})

    # City
    cities = ["mumbai", "delhi", "bangalore", "bengaluru", "hyderabad",
              "chennai", "pune", "kolkata", "jaipur", "ahmedabad"]
    found_cities = [c.title() for c in cities if c in msg]
    if found_cities:
        if len(found_cities) == 1:
            conditions.append({"field": "city", "op": "eq", "value": found_cities[0]})
        else:
            conditions.append({"field": "city", "op": "in", "value": found_cities})

    # Default: all customers if no conditions matched
    if not conditions:
        conditions = [{"field": "total_spend", "op": "gte", "value": 0}]

    # ── Offer extraction ──
    disc_m = re.search(r"(\d+)\s*%?\s*(?:off|discount|offer)", msg)
    offer = f"{disc_m.group(1)}% off" if disc_m else None

    # ── Campaign name ──
    if "vip" in msg:
        name = "VIP Customer Exclusive Offer"
    elif "at-risk" in msg or "at risk" in msg:
        name = "At-Risk Customer Re-engagement"
    elif "loyal" in msg:
        name = "Loyal Customer Reward"
    elif "new" in msg and ("customer" in msg or "user" in msg):
        name = "New Customer Welcome Campaign"
    elif "lapsed" in msg or "inactive" in msg:
        name = "Lapsed Customer Win-back"
    elif days_m:
        name = f"Inactive {days_m.group(1)}-Day Re-engagement"
    elif spend_m:
        name = "High-Value Customer Campaign"
    else:
        name = "Targeted Customer Campaign"

    goal = f"Re-engage segment via {channel} and drive a purchase"
    if offer:
        goal = f"Offer {offer} to drive conversion via {channel}"

    log.info("Rule-based parse: channel=%s conditions=%d offer=%s", channel, len(conditions), offer)

    return {
        "understood": True,
        "campaign_name": name,
        "channel": channel,
        "segment_rules": {"operator": "AND", "conditions": conditions},
        "message_goal": goal,
        "offer": offer,
        "copilot_comment": (
            f"✨ Parsed via rule engine ({len(conditions)} filter(s) · {channel.upper()}"
            + (f" · {offer}" if offer else "")
            + "). AI quota resets at midnight — full AI will resume then."
        ),
    }


def _rule_based_message(channel: str, message_goal: str, offer: Optional[str],
                         segment_desc: str, audience_size: int) -> dict:
    """Generate a sensible message template without calling Gemini."""
    offer_line = f" {offer}!" if offer else "!"
    templates = {
        "whatsapp": (
            f"Hi {{{{first_name}}}}, we have something special for you{offer_line} "
            f"{message_goal} 🛍️ Tap to explore."
        ),
        "sms": (
            f"Hi {{{{first_name}}}}{offer_line} {message_goal} Shop now."
        ),
        "email": (
            f"Dear {{{{first_name}}}},\n\n"
            f"We'd love to see you again. {message_goal}"
            + (f"\n\nYour exclusive offer: {offer}" if offer else "")
            + "\n\nClick below to browse our latest collection.\n\nWarm regards,\nThe Team"
        ),
        "rcs": (
            f"Hi {{{{first_name}}}}, we have something special for you{offer_line} "
            f"{message_goal} 🎁 Tap to explore."
        ),
    }
    return {
        "message_template": templates.get(channel, templates["whatsapp"]),
        "subject_line": f"A special offer just for you, {{{{first_name}}}}" if channel == "email" else None,
        "copywriter_note": "Rule-based template (AI quota exhausted — restores at midnight PST).",
    }


# ── Public Functions ──────────────────────────────────────────────────────────


async def parse_campaign_intent(user_message: str) -> dict:
    """
    Parse a natural language campaign request into structured segment rules.
    Tries Gemini AI first; falls back to local rule engine if quota is exhausted.
    """
    prompt = INTENT_PARSE_PROMPT.format(
        brand_context=BRAND_CONTEXT.strip(),
        user_message=user_message,
    )

    log.info("Parsing intent: %s", user_message[:80])

    # ── Try Gemini AI ──
    try:
        raw = await _generate_with_fallback(prompt)
        log.debug("Gemini raw response: %s", raw[:200])
        result = _parse_json(raw)
        log.info("Gemini parsed: understood=%s channel=%s",
                 result.get("understood"), result.get("channel"))
        return result
    except Exception as exc:
        err_str = str(exc)
        is_quota = (
            "429" in err_str or "quota" in err_str.lower()
            or "RESOURCE_EXHAUSTED" in err_str
            or "NOT_FOUND" in err_str
        )
        if is_quota:
            log.warning("All Gemini models quota-exhausted — using rule-based parser")
        else:
            log.exception("Gemini parse error (non-quota): %s", exc)

    # ── Guaranteed fallback: rule-based parser ──
    return _rule_based_parse(user_message)


async def generate_campaign_message(
    channel: str,
    message_goal: str,
    segment_description: str,
    offer: Optional[str],
    audience_size: int,
) -> dict:
    """
    Generate a personalised message template.
    Tries Gemini AI first; falls back to rule-based templates if quota is exhausted.
    """
    prompt = MESSAGE_GEN_PROMPT.format(
        brand_context=BRAND_CONTEXT.strip(),
        channel=channel,
        message_goal=message_goal,
        segment_description=segment_description,
        offer=offer or "no specific offer — focus on value and brand",
        audience_size=audience_size,
    )

    log.info("Generating message: channel=%s goal=%s", channel, message_goal[:60])

    # ── Try Gemini AI ──
    try:
        raw = await _generate_with_fallback(prompt)
        result = _parse_json(raw)
        log.info("Gemini message: %s chars", len(result.get("message_template", "")))
        return result
    except Exception as exc:
        err_str = str(exc)
        is_quota = (
            "429" in err_str or "quota" in err_str.lower()
            or "RESOURCE_EXHAUSTED" in err_str
            or "NOT_FOUND" in err_str
        )
        if is_quota:
            log.warning("All Gemini models quota-exhausted — using rule-based message template")
        else:
            log.exception("Gemini message gen error: %s", exc)

    # ── Guaranteed fallback ──
    return _rule_based_message(channel, message_goal, offer, segment_description, audience_size)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_json(raw: str) -> dict:
    """Extract and parse JSON from model response, handling markdown fences."""
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    raw = re.sub(r"\s*```$", "", raw.strip())
    return json.loads(raw)
