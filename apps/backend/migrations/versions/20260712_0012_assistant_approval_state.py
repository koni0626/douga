"""Persist assistant approval continuation state.

Revision ID: 20260712_0012
Revises: 20260712_0011
Create Date: 2026-07-12
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260712_0012"
down_revision: str | None = "20260712_0011"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "assistant_runs",
        sa.Column(
            "continuation_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("assistant_runs", "continuation_json")
