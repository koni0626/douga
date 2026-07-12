"""Create persistent assistant run events.

Revision ID: 20260712_0009
Revises: 20260712_0008
Create Date: 2026-07-12
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260712_0009"
down_revision: str | None = "20260712_0008"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_unique_constraint("uq_assistant_runs_id_user", "assistant_runs", ["id", "user_id"])
    op.create_table(
        "assistant_run_events",
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(80), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["run_id", "user_id"],
            ["assistant_runs.id", "assistant_runs.user_id"],
            name="fk_assistant_run_events_run_user_runs",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_assistant_run_events"),
        sa.UniqueConstraint("run_id", "sequence", name="uq_assistant_run_events_sequence"),
    )
    op.create_index(
        "ix_assistant_run_events_user_run_sequence",
        "assistant_run_events",
        ["user_id", "run_id", "sequence"],
    )


def downgrade() -> None:
    op.drop_table("assistant_run_events")
    op.drop_constraint("uq_assistant_runs_id_user", "assistant_runs", type_="unique")
