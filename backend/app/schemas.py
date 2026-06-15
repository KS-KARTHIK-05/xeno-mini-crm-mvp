import uuid
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, EmailStr, field_validator


# ── Customers ────────────────────────────────────────────────
class CustomerBase(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    city: Optional[str] = None
    tags: List[str] = []


class CustomerOut(CustomerBase):
    id: uuid.UUID
    total_spend: float
    order_count: int
    last_order_date: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class CustomerListOut(BaseModel):
    customers: List[CustomerOut]
    total: int


# ── Orders ───────────────────────────────────────────────────
class OrderItem(BaseModel):
    name: str
    qty: int
    price: float


class OrderOut(BaseModel):
    id: uuid.UUID
    customer_id: uuid.UUID
    amount: float
    items: List[dict]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Campaigns ────────────────────────────────────────────────
class CampaignCreate(BaseModel):
    name: str
    segment_rules: dict
    message_template: str
    channel: str
    ai_prompt: Optional[str] = None


class CampaignOut(BaseModel):
    id: uuid.UUID
    name: str
    segment_rules: dict
    message_template: str
    channel: str
    status: str
    ai_prompt: Optional[str] = None
    audience_size: int
    created_at: datetime
    launched_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CampaignStatsOut(BaseModel):
    id: uuid.UUID
    name: str
    channel: str
    status: str
    audience_size: int
    total_sent: int
    total_delivered: int
    total_read: int
    total_clicked: int
    total_failed: int
    total_converted: int
    delivery_rate: Optional[float] = None
    read_rate: Optional[float] = None
    created_at: datetime
    launched_at: Optional[datetime] = None
    segment_rules: Optional[dict] = None
    message_template: Optional[str] = None
    ai_prompt: Optional[str] = None


# ── Communications ───────────────────────────────────────────
class CommunicationOut(BaseModel):
    id: uuid.UUID
    campaign_id: uuid.UUID
    customer_id: uuid.UUID
    channel: str
    message: str
    status: str
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    clicked_at: Optional[datetime] = None
    failed_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ReceiptPayload(BaseModel):
    communication_id: uuid.UUID
    status: str   # delivered | read | clicked | failed | converted
    timestamp: datetime


# ── Copilot ──────────────────────────────────────────────────
class CopilotMessage(BaseModel):
    message: str


class SegmentPreview(BaseModel):
    rules: dict
    sql_preview: str
    count: int
    sample_customers: List[CustomerOut]


class CopilotResponse(BaseModel):
    type: str  # "segment_preview" | "message_draft" | "campaign_ready" | "info"
    text: str
    segment_preview: Optional[SegmentPreview] = None
    message_draft: Optional[str] = None
    channel: Optional[str] = None
    campaign_name: Optional[str] = None
