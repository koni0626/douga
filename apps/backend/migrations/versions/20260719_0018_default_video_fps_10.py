"""Change the default video frame rate to 10 fps.

Revision ID: 20260719_0018
Revises: 20260713_0017
Create Date: 2026-07-19
"""

import sqlalchemy as sa
from alembic import op

revision: str = "20260719_0018"
down_revision: str | None = "20260713_0017"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.alter_column(
        "user_settings",
        "default_video_fps",
        existing_type=sa.Numeric(6, 3),
        existing_nullable=False,
        server_default=sa.text("10"),
    )
    op.execute(
        sa.text(
            "UPDATE user_settings "
            "SET default_video_fps = 10 "
            "WHERE default_video_fps = 30"
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE user_settings "
            "SET default_video_fps = 30 "
            "WHERE default_video_fps = 10"
        )
    )
    op.alter_column(
        "user_settings",
        "default_video_fps",
        existing_type=sa.Numeric(6, 3),
        existing_nullable=False,
        server_default=None,
    )
