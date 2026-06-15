import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Integer, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    segment_rules: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    message_template: Mapped[str] = mapped_column(Text, nullable=False)
    channel: Mapped[str] = mapped_column(String(20), nullable=False)  # whatsapp|sms|email|rcs
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft|launching|launched|completed|error
    ai_prompt: Mapped[Optional[str]] = mapped_column(Text)             # original NL input
    audience_size: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    launched_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Relationships
    communications: Mapped[list["Communication"]] = relationship(
        "Communication", back_populates="campaign", lazy="select"
    )
