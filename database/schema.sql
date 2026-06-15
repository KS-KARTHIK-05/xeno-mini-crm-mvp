-- ============================================================
-- Xeno Mini CRM — Supabase Schema
-- Run this in the Supabase SQL Editor
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CUSTOMERS (Shoppers)
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    email           TEXT UNIQUE NOT NULL,
    phone           TEXT,
    city            TEXT,
    total_spend     NUMERIC(12, 2) DEFAULT 0,
    order_count     INTEGER DEFAULT 0,
    last_order_date TIMESTAMP WITH TIME ZONE,
    tags            TEXT[] DEFAULT '{}',
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_total_spend ON customers(total_spend);
CREATE INDEX IF NOT EXISTS idx_customers_last_order_date ON customers(last_order_date);
CREATE INDEX IF NOT EXISTS idx_customers_city ON customers(city);
CREATE INDEX IF NOT EXISTS idx_customers_order_count ON customers(order_count);

-- ============================================================
-- ORDERS (Purchase History)
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    amount      NUMERIC(10, 2) NOT NULL,
    items       JSONB DEFAULT '[]',
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_amount ON orders(amount);

-- ============================================================
-- CAMPAIGNS
-- ============================================================
CREATE TABLE IF NOT EXISTS campaigns (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name             TEXT NOT NULL,
    segment_rules    JSONB NOT NULL DEFAULT '{}',
    message_template TEXT NOT NULL,
    channel          TEXT NOT NULL CHECK (channel IN ('whatsapp', 'sms', 'email', 'rcs')),
    status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'launching', 'launched', 'completed', 'error')),
    ai_prompt        TEXT,                -- original natural language input from marketer
    created_by_ai    BOOLEAN DEFAULT FALSE,
    audience_size    INTEGER DEFAULT 0,   -- cached count at launch time
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    launched_at      TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at);

-- ============================================================
-- COMMUNICATIONS (one row per customer per campaign)
-- ============================================================
CREATE TABLE IF NOT EXISTS communications (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id   UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    channel       TEXT NOT NULL,
    message       TEXT NOT NULL,           -- final personalized message sent
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (
                    status IN ('pending', 'sent', 'delivered', 'read', 'clicked', 'failed', 'converted')
                  ),
    sent_at       TIMESTAMP WITH TIME ZONE,
    delivered_at  TIMESTAMP WITH TIME ZONE,
    read_at       TIMESTAMP WITH TIME ZONE,
    clicked_at    TIMESTAMP WITH TIME ZONE,
    converted_at  TIMESTAMP WITH TIME ZONE,
    failed_at     TIMESTAMP WITH TIME ZONE,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comms_campaign_id ON communications(campaign_id);
CREATE INDEX IF NOT EXISTS idx_comms_customer_id ON communications(customer_id);
CREATE INDEX IF NOT EXISTS idx_comms_status ON communications(status);

-- ============================================================
-- CAMPAIGN STATS VIEW (for fast dashboard queries)
-- ============================================================
CREATE OR REPLACE VIEW campaign_stats AS
SELECT
    c.id,
    c.name,
    c.channel,
    c.status,
    c.audience_size,
    c.created_at,
    c.launched_at,
    COUNT(comm.id)                                              AS total_sent,
    COUNT(comm.id) FILTER (WHERE comm.status = 'delivered')    AS total_delivered,
    COUNT(comm.id) FILTER (WHERE comm.status = 'read')         AS total_read,
    COUNT(comm.id) FILTER (WHERE comm.status = 'clicked')      AS total_clicked,
    COUNT(comm.id) FILTER (WHERE comm.status = 'failed')       AS total_failed,
    COUNT(comm.id) FILTER (WHERE comm.status = 'converted')    AS total_converted,
    ROUND(
        COUNT(comm.id) FILTER (WHERE comm.status IN ('delivered','read','clicked','converted'))::numeric
        / NULLIF(COUNT(comm.id) FILTER (WHERE comm.status != 'pending'), 0) * 100, 1
    )                                                           AS delivery_rate,
    ROUND(
        COUNT(comm.id) FILTER (WHERE comm.status IN ('read','clicked','converted'))::numeric
        / NULLIF(COUNT(comm.id) FILTER (WHERE comm.status IN ('delivered','read','clicked','converted')), 0) * 100, 1
    )                                                           AS read_rate
FROM campaigns c
LEFT JOIN communications comm ON comm.campaign_id = c.id
GROUP BY c.id;
