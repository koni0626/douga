"""Create assistant conversation tables.

Revision ID: 20260712_0008
Revises: 20260711_0007
Create Date: 2026-07-12
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260712_0008"
down_revision: str | None = "20260711_0007"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "assistant_threads",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("provider_conversation_id", sa.String(255)),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("status IN ('active', 'archived')", name="ck_assistant_threads_status"),
        sa.ForeignKeyConstraint(
            ["project_id", "user_id"],
            ["projects.id", "projects.user_id"],
            name="fk_assistant_threads_project_user_projects",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_assistant_threads"),
        sa.UniqueConstraint("id", "user_id", name="uq_assistant_threads_id_user"),
    )
    op.create_index(
        "ix_assistant_threads_user_project_updated",
        "assistant_threads",
        ["user_id", "project_id", "updated_at"],
    )
    op.create_table(
        "assistant_messages",
        sa.Column("thread_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(30), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_json", postgresql.JSONB(astext_type=sa.Text())),
        sa.Column("provider_item_id", sa.String(255)),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "role IN ('user', 'assistant', 'system_summary')", name="ck_assistant_messages_role"
        ),
        sa.ForeignKeyConstraint(
            ["thread_id", "user_id"],
            ["assistant_threads.id", "assistant_threads.user_id"],
            name="fk_assistant_messages_thread_user_threads",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_assistant_messages"),
    )
    op.create_index(
        "ix_assistant_messages_user_thread_created",
        "assistant_messages",
        ["user_id", "thread_id", "created_at"],
    )
    op.create_table(
        "assistant_runs",
        sa.Column("thread_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("base_revision_number", sa.Integer(), nullable=False),
        sa.Column("result_revision_number", sa.Integer()),
        sa.Column("provider_response_id", sa.String(255)),
        sa.Column("usage_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("error_code", sa.String(100)),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "status IN ('queued', 'running', 'waiting_approval', "
            "'completed', 'failed', 'cancelled')",
            name="ck_assistant_runs_status",
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name="fk_assistant_runs_project_id_projects",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["thread_id", "user_id"],
            ["assistant_threads.id", "assistant_threads.user_id"],
            name="fk_assistant_runs_thread_user_threads",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_assistant_runs"),
    )
    op.create_index(
        "ix_assistant_runs_user_thread_created",
        "assistant_runs",
        ["user_id", "thread_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_table("assistant_runs")
    op.drop_table("assistant_messages")
    op.drop_table("assistant_threads")
