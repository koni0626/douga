"""Allow failed idempotency reservation state.

Revision ID: 20260712_0016
Revises: 20260712_0015
Create Date: 2026-07-12
"""

from alembic import op

revision: str = "20260712_0016"
down_revision: str | None = "20260712_0015"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.drop_constraint(
        "ck_api_idempotency_state", "api_idempotency_records", type_="check"
    )
    op.create_check_constraint(
        "ck_api_idempotency_state",
        "api_idempotency_records",
        "state IN ('running', 'completed', 'failed')",
    )


def downgrade() -> None:
    op.execute("DELETE FROM api_idempotency_records WHERE state = 'failed'")
    op.drop_constraint(
        "ck_api_idempotency_state", "api_idempotency_records", type_="check"
    )
    op.create_check_constraint(
        "ck_api_idempotency_state",
        "api_idempotency_records",
        "state IN ('running', 'completed')",
    )
