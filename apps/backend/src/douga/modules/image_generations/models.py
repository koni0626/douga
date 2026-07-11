from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from douga.db.base import Base, TimestampMixin, UuidPrimaryKeyMixin


class ImageGenerationRequest(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "image_generation_requests"
    __table_args__ = (
        CheckConstraint("quality IN ('low', 'medium', 'high')", name="quality"),
        CheckConstraint("size IN ('1024x1024', '1024x1536', '1536x1024')", name="size"),
        Index("ix_image_generation_requests_user_created", "user_id", "created_at"),
    )

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    job_id: Mapped[UUID] = mapped_column(
        ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    quality: Mapped[str] = mapped_column(String(20), nullable=False)
    size: Mapped[str] = mapped_column(String(20), nullable=False)
    output_asset_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("assets.id", ondelete="SET NULL")
    )
