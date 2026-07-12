"""Add ranged previews and enforce one active assistant run.

Revision ID: 20260712_0013
Revises: 20260712_0012
Create Date: 2026-07-12
"""

import sqlalchemy as sa
from alembic import op

revision: str = "20260712_0013"
down_revision: str | None = "20260712_0012"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "exports",
        sa.Column("kind", sa.String(length=20), server_default="export", nullable=False),
    )
    op.add_column("exports", sa.Column("range_start_ms", sa.BigInteger(), nullable=True))
    op.add_column("exports", sa.Column("range_end_ms", sa.BigInteger(), nullable=True))
    op.create_check_constraint("ck_exports_kind", "exports", "kind IN ('export', 'preview')")
    op.create_check_constraint(
        "ck_exports_range_valid",
        "exports",
        "(range_start_ms IS NULL AND range_end_ms IS NULL) OR "
        "(range_start_ms >= 0 AND range_end_ms > range_start_ms)",
    )
    op.create_index(
        "uq_assistant_runs_thread_active",
        "assistant_runs",
        ["thread_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('queued', 'running', 'waiting_approval')"),
    )


def downgrade() -> None:
    op.drop_index("uq_assistant_runs_thread_active", table_name="assistant_runs")
    op.drop_constraint("ck_exports_range_valid", "exports", type_="check")
    op.drop_constraint("ck_exports_kind", "exports", type_="check")
    op.drop_column("exports", "range_end_ms")
    op.drop_column("exports", "range_start_ms")
    op.drop_column("exports", "kind")
