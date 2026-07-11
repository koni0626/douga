"""Create the project asset reference index.

Revision ID: 20260711_0005
Revises: 20260711_0004
Create Date: 2026-07-11
"""

import sqlalchemy as sa
from alembic import op

revision: str = "20260711_0005"
down_revision: str | None = "20260711_0004"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "project_assets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("project_revision_id", sa.Uuid(), nullable=False),
        sa.Column("asset_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(30), nullable=False),
        sa.Column("reference_path", sa.String(500), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["asset_id"],
            ["assets.id"],
            name="fk_project_assets_asset_id_assets",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["project_id", "user_id"],
            ["projects.id", "projects.user_id"],
            name="fk_project_assets_project_user_projects",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["project_revision_id", "project_id", "user_id"],
            ["project_revisions.id", "project_revisions.project_id", "project_revisions.user_id"],
            name="fk_project_assets_revision_project_user_revisions",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_project_assets"),
        sa.UniqueConstraint(
            "project_revision_id",
            "reference_path",
            name="uq_project_assets_revision_path",
        ),
    )
    op.create_index(
        "ix_project_assets_user_id_project_id", "project_assets", ["user_id", "project_id"]
    )
    op.create_index("ix_project_assets_asset_id", "project_assets", ["asset_id"])
    op.create_index(
        "ix_project_assets_project_revision_id", "project_assets", ["project_revision_id"]
    )


def downgrade() -> None:
    op.drop_table("project_assets")
