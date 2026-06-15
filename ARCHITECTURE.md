# Xeno Mini CRM — Architecture Blueprint

## What We're Building

A **Campaign Copilot** — a single-screen, AI-native CRM where a marketer types a goal in natural language and the system handles everything: segmentation, message drafting, campaign dispatch, and live delivery tracking.

---

## 1. Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | React.js + Vite + Tailwind CSS | Fast SPA, great component model for the split-pane UI |
| **Backend** | Python + FastAPI | Native async, perfect for background workers and WebSocket broadcasting |
| **Database** | PostgreSQL via Supabase | Serverless, reliable, and segment filters map naturally to SQL |
| **Real-time** | WebSockets (FastAPI native) | Stream live receipt events to the UI without polling |
| **AI Engine** | Google Gemini API (Structured Outputs) | Guarantees clean JSON for segment rules and message templates |

---

## 2. The Split-Screen Interface

```
┌────────────────────────────┬───────────────────────────────────┐
│   LEFT: Copilot Chat        │   RIGHT: Live Canvas              │
│                            │                                   │
│  Terminal-style NL input    │  ┌─ Segment Preview ───────────┐ │
│  > "Find customers who      │  │  847 customers matched       │ │
│    spent ₹5k+ but haven't  │  │  SQL: SELECT * FROM ...      │ │
│    bought in 90 days and   │  └──────────────────────────────┘ │
│    draft a WhatsApp msg"   │  ┌─ AI Message Draft ──────────┐ │
│                            │  │  "Hi {name}, we miss you!   │ │
│  [AI Response Cards]       │  │   Here's 15% off your..."  │ │
│  [Segment Preview Card]    │  └──────────────────────────────┘ │
│  [Message Draft Card]      │  ┌─ Live Campaign Feed ────────┐ │
│  [Launch Button]           │  │  ● Priya Sharma — Delivered  │ │
│                            │  │  ● Rahul Mehta — Opened      │ │
│                            │  │  ● Ananya Iyer — Clicked     │ │
│                            │  └──────────────────────────────┘ │
└────────────────────────────┴───────────────────────────────────┘
```

---

## 3. Simulated Callback Loop

```
React UI
   │  (1) Launch Campaign
   ▼
FastAPI Backend ──────────────── Supabase DB
   │  Inserts communications     status = "pending"
   │
   ▼ (background task, no blocking)
Channel Service Stub (async worker inside FastAPI)
   │  • 2–5 second simulated network delay
   │  • Weighted random outcome per message:
   │      70% → delivered + read
   │      20% → delivered, unread
   │      10% → failed
   │
   ▼ (mock webhook callback → CRM receipt endpoint)
FastAPI /api/receipts
   │  Updates communications table
   │
   ▼
WebSocket broadcast → React UI
   Live Canvas updates in real-time (no page refresh)
```

---

## 4. AI Copilot Pipeline

### Natural Language → Campaign (4 steps)

```
User Input: "Re-engage customers who spent ₹5k+ in last 6 months
             but haven't ordered in 90 days"
     │
     ▼
[Step 1] Intent Parsing (Gemini → Structured JSON)
     {
       "segment_rules": {
         "operator": "AND",
         "conditions": [
           { "field": "total_spend", "op": "gte", "value": 5000, "window": "6m" },
           { "field": "last_order_date", "op": "lt", "value": "now - 90 days" }
         ]
       },
       "channel": "whatsapp",
       "goal": "re-engagement",
       "offer": "discount"
     }
     │
     ▼
[Step 2] Segment Evaluation (JSON Rules → SQL → Supabase)
     → Returns: count=847, sample=[Priya, Rahul, Ananya...]
     → Shows SQL preview to marketer (transparency feature)
     │
     ▼
[Step 3] Message Generation (Gemini → personalized copy)
     → "Hi {{name}}, we've missed you at Aura Styles! ..."
     → Marketer can edit before launching
     │
     ▼
[Step 4] Human Confirmation → Launch
     → Marketer reviews segment + message → clicks Launch
     → Campaign dispatched to Channel Stub
```

---

## 5. Data Model

```sql
-- Shoppers
customers (
  id UUID PK,
  name TEXT,
  email TEXT,
  phone TEXT,
  city TEXT,
  total_spend NUMERIC,
  order_count INT,
  last_order_date TIMESTAMP,
  tags TEXT[],
  created_at TIMESTAMP
)

-- Purchase history
orders (
  id UUID PK,
  customer_id UUID FK,
  amount NUMERIC,
  items JSONB,           -- [{ "name": "Silk Kurta", "qty": 1 }]
  created_at TIMESTAMP
)

-- Campaigns created by the marketer (via Copilot)
campaigns (
  id UUID PK,
  name TEXT,
  segment_rules JSONB,  -- the parsed filter from AI
  message_template TEXT,
  channel TEXT,         -- whatsapp | sms | email | rcs
  status TEXT,          -- draft | launched | completed
  ai_prompt TEXT,       -- the original user input (for auditability)
  created_at TIMESTAMP,
  launched_at TIMESTAMP
)

-- One row per customer per campaign
communications (
  id UUID PK,
  campaign_id UUID FK,
  customer_id UUID FK,
  message TEXT,         -- personalized final message
  channel TEXT,
  status TEXT,          -- pending | delivered | read | clicked | failed
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  read_at TIMESTAMP,
  clicked_at TIMESTAMP,
  failed_at TIMESTAMP
)
```

---

## 6. Scope & Tradeoffs

### What's In
- ✅ 500 pre-seeded mock customers + 2,000 orders ("Aura Styles & Co" — Indian D2C fashion brand)
- ✅ Natural language → SQL segment builder (AI-generated, SQL preview shown to marketer)
- ✅ AI-drafted personalized message templates
- ✅ Full async callback loop: CRM → Channel Stub → receipt → WebSocket → UI
- ✅ Live campaign stats: sent / delivered / read / clicked / failed
- ✅ Campaign history dashboard
- ✅ Customer browser with order history

### What's Skipped — and Why That's the Right Call

#### ❌ User Authentication (Login/Signup)
Auth is solved infrastructure — JWT + middleware — that every engineer knows how to build.
Adding a login screen would consume build time without demonstrating any of the skills being evaluated.
**At production scale**: JWT-based auth with role-based access per brand. This is a deliberate, stated tradeoff — not an oversight.

#### ❌ Drag-and-Drop Visual Segment Builder
This is the most intentional skip. The entire premise of the product is that **the AI replaces the drag-and-drop builder**. If we build the visual block editor, we are working against our own product thesis. Marketers shouldn't need to drag "spend > ₹5000" filter blocks around — they should just *say it*.
Skipping the visual builder isn't a limitation — **it's the product point of view**.

---

## 7. Scale Assumptions (Stated Tradeoffs)

| Decision | This Build | Production |
|---|---|---|
| Background tasks | FastAPI `BackgroundTasks` (in-process) | Celery + Redis with dead-letter queues |
| Receipt handling | Direct HTTP callback | Event streaming (AWS SQS / Kafka) |
| Segment computation | On-demand SQL query | Pre-computed + cached in Redis, refreshed on schedule |
| Campaign dispatch | Sequential per-customer loop | Batched parallel dispatch with rate limiting |
| WebSocket | Single server, in-memory | Redis pub/sub for multi-instance broadcast |
| DB | Supabase free tier | Read replicas + PgBouncer connection pooling |

---

## 8. Deployment

- **CRM Backend**: Render (Python web service — free tier)
- **Channel Service Stub**: Render (separate free tier service)
- **Frontend**: Vercel (free tier static hosting)
- **Database**: Supabase (managed cloud Postgres — free tier)

Both Render services share environment variables for the callback URL so the channel stub can POST receipts back to the correct CRM endpoint regardless of environment. Note: Render free tier services spin down after 15 minutes of inactivity — acceptable for a demo, and worth mentioning in the README.

---

## Seed Data: "Aura Styles & Co"

A fictional Indian D2C fashion brand. Data includes:
- 500 customers across Delhi, Mumbai, Bangalore, Hyderabad, Chennai, Pune
- Orders ranging ₹500–₹25,000 with realistic product names (Silk Kurta, Linen Co-ord Set, etc.)
- Order dates spread across last 18 months to enable interesting segmentation scenarios
- Tags: `vip`, `at-risk`, `new`, `frequent-buyer`, `lapsed`

The data is designed to make every demo segmentation query return a meaningful, non-trivial result.
