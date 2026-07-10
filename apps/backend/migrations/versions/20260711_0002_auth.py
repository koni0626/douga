"""Create users, settings, and sessions.

Revision ID: 20260711_0002
Revises: 20260711_0001
Create Date: 2026-07-11
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260711_0002"
down_revision: str | None = "20260711_0001"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("email_normalized", sa.String(320), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("preferred_locale", sa.String(10), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("email_verified_at", sa.DateTime(timezone=True)),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("preferred_locale IN ('ja', 'en')", name="ck_users_preferred_locale"),
        sa.CheckConstraint("role IN ('user', 'admin')", name="ck_users_role"),
        sa.CheckConstraint(
            "status IN ('active', 'disabled', 'pending_verification')", name="ck_users_status"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("email_normalized", name="uq_users_email_normalized"),
    )
    op.create_index("ix_users_status_created_at", "users", ["status", "created_at"])
    op.create_table(
        "user_settings",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("default_content_locale", sa.String(10), nullable=False),
        sa.Column("default_video_width", sa.Integer(), nullable=False),
        sa.Column("default_video_height", sa.Integer(), nullable=False),
        sa.Column("default_video_fps", sa.Numeric(6, 3), nullable=False),
        sa.Column(
            "default_caption_settings",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "default_content_locale IN ('ja', 'en')", name="ck_user_settings_content_locale"
        ),
        sa.CheckConstraint("default_video_width > 0", name="ck_user_settings_video_width_positive"),
        sa.CheckConstraint(
            "default_video_height > 0", name="ck_user_settings_video_height_positive"
        ),
        sa.CheckConstraint("default_video_fps > 0", name="ck_user_settings_video_fps_positive"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_user_settings_user_id_users", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", name="pk_user_settings"),
    )
    op.create_table(
        "sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("csrf_token_hash", sa.String(64), nullable=False),
        sa.Column("user_agent", sa.String(512)),
        sa.Column("ip_hash", sa.String(64)),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_sessions_user_id_users", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sessions"),
        sa.UniqueConstraint("token_hash", name="uq_sessions_token_hash"),
    )
    op.create_index("ix_sessions_user_id_expires_at", "sessions", ["user_id", "expires_at"])
    op.create_index("ix_sessions_expires_at", "sessions", ["expires_at"])


def downgrade() -> None:
    op.drop_table("sessions")
    op.drop_table("user_settings")
    op.drop_table("users")
