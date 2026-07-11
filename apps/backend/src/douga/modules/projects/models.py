from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    JSON,
    BigInteger,
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


class Project(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint("status IN ('draft', 'editing', 'rendered', 'archived')", name="status"),
        CheckConstraint("content_locale IN ('ja', 'en')", name="content_locale"),
        CheckConstraint("current_revision_number >= 0", name="revision_nonnegative"),
        CheckConstraint("lock_version >= 0", name="lock_version_nonnegative"),
        CheckConstraint("scene_count >= 0", name="scene_count_nonnegative"),
        CheckConstraint(
            "estimated_duration_ms IS NULL OR estimated_duration_ms >= 0",
            name="duration_nonnegative",
        ),
        UniqueConstraint("id", "user_id", name="uq_projects_id_user_id"),
        Index("ix_projects_user_id_updated_at", "user_id", "updated_at"),
        Index("ix_projects_user_id_status", "user_id", "status"),
        Index("ix_projects_user_id_name", "user_id", "name"),
    )

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="draft")
    content_locale: Mapped[str] = mapped_column(String(10), nullable=False, default="ja")
    current_revision_number: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lock_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    estimated_duration_ms: Mapped[int | None] = mapped_column(BigInteger)
    scene_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    thumbnail_asset_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("assets.id", ondelete="SET NULL"), nullable=True
    )
    last_exported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ProjectRevision(UuidPrimaryKeyMixin, Base):
    __tablename__ = "project_revisions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "user_id"],
            ["projects.id", "projects.user_id"],
            ondelete="CASCADE",
            name="fk_project_revisions_project_user_projects",
        ),
        CheckConstraint("revision_number > 0", name="revision_positive"),
        CheckConstraint("schema_version > 0", name="schema_version_positive"),
        UniqueConstraint(
            "project_id",
            "revision_number",
            name="uq_project_revisions_project_id_revision_number",
        ),
        UniqueConstraint(
            "id", "project_id", "user_id", name="uq_project_revisions_id_project_user"
        ),
        Index(
            "ix_project_revisions_user_project_created",
            "user_id",
            "project_id",
            "created_at",
        ),
    )

    project_id: Mapped[UUID] = mapped_column(nullable=False)
    user_id: Mapped[UUID] = mapped_column(nullable=False)
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False)
    document: Mapped[dict[str, Any]] = mapped_column(
        JSON().with_variant(JSONB, "postgresql"), nullable=False
    )
    document_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    change_summary: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ProjectAsset(UuidPrimaryKeyMixin, Base):
    __tablename__ = "project_assets"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "user_id"],
            ["projects.id", "projects.user_id"],
            ondelete="CASCADE",
            name="fk_project_assets_project_user_projects",
        ),
        ForeignKeyConstraint(
            ["project_revision_id", "project_id", "user_id"],
            ["project_revisions.id", "project_revisions.project_id", "project_revisions.user_id"],
            ondelete="CASCADE",
            name="fk_project_assets_revision_project_user_revisions",
        ),
        UniqueConstraint(
            "project_revision_id", "reference_path", name="uq_project_assets_revision_path"
        ),
        Index("ix_project_assets_user_id_project_id", "user_id", "project_id"),
        Index("ix_project_assets_asset_id", "asset_id"),
        Index("ix_project_assets_project_revision_id", "project_revision_id"),
    )

    user_id: Mapped[UUID] = mapped_column(nullable=False)
    project_id: Mapped[UUID] = mapped_column(nullable=False)
    project_revision_id: Mapped[UUID] = mapped_column(nullable=False)
    asset_id: Mapped[UUID] = mapped_column(
        ForeignKey("assets.id", ondelete="RESTRICT"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(30), nullable=False)
    reference_path: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
