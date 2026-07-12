from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from douga.db.base import Base, TimestampMixin, UuidPrimaryKeyMixin


class AssistantThread(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "assistant_threads"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "user_id"],
            ["projects.id", "projects.user_id"],
            ondelete="CASCADE",
            name="fk_assistant_threads_project_user_projects",
        ),
        CheckConstraint("status IN ('active', 'archived')", name="status"),
        UniqueConstraint("id", "user_id", name="uq_assistant_threads_id_user"),
        Index("ix_assistant_threads_user_project_updated", "user_id", "project_id", "updated_at"),
    )

    user_id: Mapped[UUID] = mapped_column(nullable=False)
    project_id: Mapped[UUID] = mapped_column(nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    provider_conversation_id: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")


class AssistantMessage(UuidPrimaryKeyMixin, Base):
    __tablename__ = "assistant_messages"
    __table_args__ = (
        ForeignKeyConstraint(
            ["thread_id", "user_id"],
            ["assistant_threads.id", "assistant_threads.user_id"],
            ondelete="CASCADE",
            name="fk_assistant_messages_thread_user_threads",
        ),
        CheckConstraint("role IN ('user', 'assistant', 'system_summary')", name="role"),
        Index("ix_assistant_messages_user_thread_created", "user_id", "thread_id", "created_at"),
    )

    thread_id: Mapped[UUID] = mapped_column(nullable=False)
    user_id: Mapped[UUID] = mapped_column(nullable=False)
    role: Mapped[str] = mapped_column(String(30), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_json: Mapped[dict[str, Any] | None] = mapped_column(
        JSON().with_variant(JSONB, "postgresql")
    )
    provider_item_id: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AssistantRun(UuidPrimaryKeyMixin, Base):
    __tablename__ = "assistant_runs"
    __table_args__ = (
        ForeignKeyConstraint(
            ["thread_id", "user_id"],
            ["assistant_threads.id", "assistant_threads.user_id"],
            ondelete="CASCADE",
            name="fk_assistant_runs_thread_user_threads",
        ),
        CheckConstraint(
            "status IN ('queued', 'running', 'waiting_approval', "
            "'completed', 'failed', 'cancelled')",
            name="status",
        ),
        UniqueConstraint("id", "user_id", name="uq_assistant_runs_id_user"),
        Index("ix_assistant_runs_user_thread_created", "user_id", "thread_id", "created_at"),
    )

    thread_id: Mapped[UUID] = mapped_column(nullable=False)
    user_id: Mapped[UUID] = mapped_column(nullable=False)
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="queued")
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    base_revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    result_revision_number: Mapped[int | None] = mapped_column(Integer)
    provider_response_id: Mapped[str | None] = mapped_column(String(255))
    usage_json: Mapped[dict[str, Any]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), nullable=False, default=dict
    )
    error_code: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AssistantRunEvent(UuidPrimaryKeyMixin, Base):
    __tablename__ = "assistant_run_events"
    __table_args__ = (
        ForeignKeyConstraint(
            ["run_id", "user_id"],
            ["assistant_runs.id", "assistant_runs.user_id"],
            ondelete="CASCADE",
            name="fk_assistant_run_events_run_user_runs",
        ),
        UniqueConstraint("run_id", "sequence", name="uq_assistant_run_events_sequence"),
        Index("ix_assistant_run_events_user_run_sequence", "user_id", "run_id", "sequence"),
    )

    run_id: Mapped[UUID] = mapped_column(nullable=False)
    user_id: Mapped[UUID] = mapped_column(nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    data: Mapped[dict[str, Any]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), nullable=False, default=dict
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
