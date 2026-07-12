"""Create assistant tool calls and creative documents.

Revision ID: 20260712_0010
Revises: 20260712_0009
Create Date: 2026-07-12
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260712_0010"
down_revision: str | None = "20260712_0009"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "assistant_tool_calls",
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("provider_call_id", sa.String(255), nullable=False),
        sa.Column("tool_name", sa.String(100), nullable=False),
        sa.Column("arguments_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("result_json", postgresql.JSONB(astext_type=sa.Text())),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("approval_required", sa.Boolean(), nullable=False),
        sa.Column("approved_at", sa.DateTime(timezone=True)),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "status IN ('requested', 'waiting_approval', 'running', "
            "'completed', 'failed', 'cancelled')",
            name="ck_assistant_tool_calls_status",
        ),
        sa.ForeignKeyConstraint(
            ["run_id", "user_id"],
            ["assistant_runs.id", "assistant_runs.user_id"],
            name="fk_assistant_tool_calls_run_user_runs",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_assistant_tool_calls"),
        sa.UniqueConstraint("run_id", "provider_call_id", name="uq_assistant_tool_calls_provider"),
    )
    op.create_index(
        "ix_assistant_tool_calls_user_run_created",
        "assistant_tool_calls",
        ["user_id", "run_id", "created_at"],
    )
    op.create_table(
        "creative_documents",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("content", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("source_run_id", sa.Uuid()),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "kind IN ('brief', 'plot', 'script', 'storyboard')",
            name="ck_creative_documents_kind",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'proposed', 'approved', 'superseded')",
            name="ck_creative_documents_status",
        ),
        sa.ForeignKeyConstraint(
            ["project_id", "user_id"],
            ["projects.id", "projects.user_id"],
            name="fk_creative_documents_project_user_projects",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_run_id"],
            ["assistant_runs.id"],
            name="fk_creative_documents_source_run_id_assistant_runs",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_creative_documents"),
        sa.UniqueConstraint(
            "project_id",
            "user_id",
            "kind",
            "version",
            name="uq_creative_documents_version",
        ),
    )
    op.create_index(
        "ix_creative_documents_user_project_kind_version",
        "creative_documents",
        ["user_id", "project_id", "kind", "version"],
    )


def downgrade() -> None:
    op.drop_table("creative_documents")
    op.drop_table("assistant_tool_calls")
