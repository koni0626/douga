"""Create project exports.

Revision ID: 20260711_0007
Revises: 20260711_0006
Create Date: 2026-07-11
"""

import sqlalchemy as sa
from alembic import op

revision: str = "20260711_0007"
down_revision: str | None = "20260711_0006"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "exports",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("project_revision_id", sa.Uuid(), nullable=False),
        sa.Column("job_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("fps", sa.Integer(), nullable=False),
        sa.Column("storage_key", sa.String(1024)),
        sa.Column("mime_type", sa.String(100)),
        sa.Column("size_bytes", sa.BigInteger()),
        sa.Column("duration_ms", sa.BigInteger()),
        sa.Column("codec", sa.String(50)),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("width > 0 AND height > 0", name="ck_exports_dimensions_positive"),
        sa.CheckConstraint("fps > 0", name="ck_exports_fps_positive"),
        sa.ForeignKeyConstraint(
            ["job_id"], ["jobs.id"], name="fk_exports_job_id_jobs", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name="fk_exports_project_id_projects",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["project_revision_id"],
            ["project_revisions.id"],
            name="fk_exports_project_revision_id_project_revisions",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_exports_user_id_users", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_exports"),
        sa.UniqueConstraint("job_id", name="uq_exports_job_id"),
        sa.UniqueConstraint("storage_key", name="uq_exports_storage_key"),
    )
    op.create_index("ix_exports_user_id_created_at", "exports", ["user_id", "created_at"])
    op.create_index("ix_exports_project_id_created_at", "exports", ["project_id", "created_at"])


def downgrade() -> None:
    op.drop_table("exports")
