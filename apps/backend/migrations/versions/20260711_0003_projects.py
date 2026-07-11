"""Create projects and project revisions.

Revision ID: 20260711_0003
Revises: 20260711_0002
Create Date: 2026-07-11
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260711_0003"
down_revision: str | None = "20260711_0002"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("content_locale", sa.String(10), nullable=False),
        sa.Column("current_revision_number", sa.Integer(), nullable=False),
        sa.Column("lock_version", sa.Integer(), nullable=False),
        sa.Column("estimated_duration_ms", sa.BigInteger()),
        sa.Column("scene_count", sa.Integer(), nullable=False),
        sa.Column("thumbnail_asset_id", sa.Uuid()),
        sa.Column("last_exported_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "status IN ('draft', 'editing', 'rendered', 'archived')",
            name="ck_projects_status",
        ),
        sa.CheckConstraint("content_locale IN ('ja', 'en')", name="ck_projects_content_locale"),
        sa.CheckConstraint("current_revision_number >= 0", name="ck_projects_revision_nonnegative"),
        sa.CheckConstraint("lock_version >= 0", name="ck_projects_lock_version_nonnegative"),
        sa.CheckConstraint("scene_count >= 0", name="ck_projects_scene_count_nonnegative"),
        sa.CheckConstraint(
            "estimated_duration_ms IS NULL OR estimated_duration_ms >= 0",
            name="ck_projects_duration_nonnegative",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_projects_user_id_users", ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_projects"),
        sa.UniqueConstraint("id", "user_id", name="uq_projects_id_user_id"),
    )
    op.create_index("ix_projects_user_id_updated_at", "projects", ["user_id", "updated_at"])
    op.create_index("ix_projects_user_id_status", "projects", ["user_id", "status"])
    op.create_index("ix_projects_user_id_name", "projects", ["user_id", "name"])
    op.create_table(
        "project_revisions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("revision_number", sa.Integer(), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("document", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("document_sha256", sa.String(64), nullable=False),
        sa.Column("change_summary", sa.String(500)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("revision_number > 0", name="ck_project_revisions_revision_positive"),
        sa.CheckConstraint(
            "schema_version > 0", name="ck_project_revisions_schema_version_positive"
        ),
        sa.ForeignKeyConstraint(
            ["project_id", "user_id"],
            ["projects.id", "projects.user_id"],
            name="fk_project_revisions_project_user_projects",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_project_revisions"),
        sa.UniqueConstraint(
            "project_id",
            "revision_number",
            name="uq_project_revisions_project_id_revision_number",
        ),
        sa.UniqueConstraint(
            "id", "project_id", "user_id", name="uq_project_revisions_id_project_user"
        ),
    )
    op.create_index(
        "ix_project_revisions_user_project_created",
        "project_revisions",
        ["user_id", "project_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_table("project_revisions")
    op.drop_table("projects")
