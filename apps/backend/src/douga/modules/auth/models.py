from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from douga.db.base import Base, TimestampMixin, UuidPrimaryKeyMixin


class User(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("preferred_locale IN ('ja', 'en')", name="preferred_locale"),
        CheckConstraint("role IN ('user', 'admin')", name="role"),
        CheckConstraint("status IN ('active', 'disabled', 'pending_verification')", name="status"),
        Index("ix_users_status_created_at", "status", "created_at"),
    )

    email: Mapped[str] = mapped_column(String(320), nullable=False)
    email_normalized: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    preferred_locale: Mapped[str] = mapped_column(String(10), nullable=False, default="ja")
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="user")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active")
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class UserSession(UuidPrimaryKeyMixin, Base):
    __tablename__ = "sessions"
    __table_args__ = (
        Index("ix_sessions_user_id_expires_at", "user_id", "expires_at"),
        Index("ix_sessions_expires_at", "expires_at"),
    )

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    csrf_token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    user_agent: Mapped[str | None] = mapped_column(String(512))
    ip_hash: Mapped[str | None] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class UserSettings(TimestampMixin, Base):
    __tablename__ = "user_settings"
    __table_args__ = (
        CheckConstraint("default_content_locale IN ('ja', 'en')", name="content_locale"),
        CheckConstraint("default_video_width > 0", name="video_width_positive"),
        CheckConstraint("default_video_height > 0", name="video_height_positive"),
        CheckConstraint("default_video_fps > 0", name="video_fps_positive"),
    )

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    default_content_locale: Mapped[str] = mapped_column(String(10), nullable=False, default="ja")
    default_video_width: Mapped[int] = mapped_column(Integer, nullable=False, default=1920)
    default_video_height: Mapped[int] = mapped_column(Integer, nullable=False, default=1080)
    default_video_fps: Mapped[Decimal] = mapped_column(
        Numeric(6, 3), nullable=False, default=Decimal("30")
    )
    default_caption_settings: Mapped[dict[str, Any]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), nullable=False, default=dict
    )
