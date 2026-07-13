"""Track the source asset for image edits.

Revision ID: 20260713_0017
Revises: 20260712_0016
Create Date: 2026-07-13
"""

import sqlalchemy as sa
from alembic import op

revision: str = "20260713_0017"
down_revision: str | None = "20260712_0016"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "image_generation_requests",
        sa.Column("parent_asset_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_image_generation_requests_parent_asset",
        "image_generation_requests",
        "assets",
        ["parent_asset_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_image_generation_requests_parent_asset",
        "image_generation_requests",
        type_="foreignkey",
    )
    op.drop_column("image_generation_requests", "parent_asset_id")
