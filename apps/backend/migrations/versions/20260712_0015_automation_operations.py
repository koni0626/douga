"""Add idempotency and automation operation audit tables.

Revision ID: 20260712_0015
Revises: 20260712_0014
Create Date: 2026-07-12
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260712_0015"
down_revision: str | None = "20260712_0014"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "api_idempotency_records",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("key", sa.String(length=200), nullable=False),
        sa.Column("method", sa.String(length=10), nullable=False),
        sa.Column("path", sa.String(length=500), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("state", sa.String(length=20), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=True),
        sa.Column(
            "response_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "state IN ('running', 'completed')", name="ck_api_idempotency_state"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_api_idempotency_records"),
        sa.UniqueConstraint(
            "user_id",
            "method",
            "path",
            "key",
            name="uq_api_idempotency_scope_key",
        ),
    )
    op.create_index(
        "ix_api_idempotency_expires", "api_idempotency_records", ["expires_at"]
    )
    op.create_table(
        "automation_operations",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("api_token_id", sa.Uuid(), nullable=False),
        sa.Column("source", sa.String(length=100), nullable=False),
        sa.Column("external_run_id", sa.String(length=200), nullable=True),
        sa.Column("operation_type", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=True),
        sa.Column("resource_type", sa.String(length=50), nullable=True),
        sa.Column("resource_id", sa.Uuid(), nullable=True),
        sa.Column(
            "summary_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("error_code", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "status IN ('running', 'completed', 'failed')",
            name="ck_automation_operations_status",
        ),
        sa.ForeignKeyConstraint(
            ["api_token_id"], ["api_tokens.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_automation_operations"),
    )
    op.create_index(
        "ix_automation_operations_user_created",
        "automation_operations",
        ["user_id", "created_at"],
    )
    op.create_index(
        "ix_automation_operations_external_run",
        "automation_operations",
        ["user_id", "external_run_id"],
    )


def downgrade() -> None:
    op.drop_table("automation_operations")
    op.drop_table("api_idempotency_records")
