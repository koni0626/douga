"""Track assistant run undo revisions.

Revision ID: 20260712_0011
Revises: 20260712_0010
Create Date: 2026-07-12
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260712_0011"
down_revision: str | None = "20260712_0010"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "assistant_runs",
        sa.Column(
            "context_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )
    op.add_column("assistant_runs", sa.Column("undo_revision_number", sa.Integer()))


def downgrade() -> None:
    op.drop_column("assistant_runs", "undo_revision_number")
    op.drop_column("assistant_runs", "context_json")
