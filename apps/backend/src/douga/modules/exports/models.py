from uuid import UUID

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from douga.db.base import Base, TimestampMixin, UuidPrimaryKeyMixin


class Export(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "exports"
    __table_args__ = (
        CheckConstraint("width > 0 AND height > 0", name="dimensions_positive"),
        CheckConstraint("fps > 0", name="fps_positive"),
        Index("ix_exports_user_id_created_at", "user_id", "created_at"),
        Index("ix_exports_project_id_created_at", "project_id", "created_at"),
    )

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    project_revision_id: Mapped[UUID] = mapped_column(
        ForeignKey("project_revisions.id", ondelete="RESTRICT"), nullable=False
    )
    job_id: Mapped[UUID] = mapped_column(
        ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    fps: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_key: Mapped[str | None] = mapped_column(String(1024), unique=True)
    mime_type: Mapped[str | None] = mapped_column(String(100))
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    duration_ms: Mapped[int | None] = mapped_column(BigInteger)
    codec: Mapped[str | None] = mapped_column(String(50))
