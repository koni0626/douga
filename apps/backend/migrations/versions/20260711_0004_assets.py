"""Create assets, tags, and derivatives.

Revision ID: 20260711_0004
Revises: 20260711_0003
Create Date: 2026-07-11
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260711_0004"
down_revision: str | None = "20260711_0003"
branch_labels: str | None = None
depends_on: str | None = None


def timestamp_columns() -> list[sa.Column]:
    return [
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
    ]


def upgrade() -> None:
    op.create_table(
        "assets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid()),
        sa.Column("scope", sa.String(20), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("original_filename", sa.String(255)),
        sa.Column("storage_key", sa.String(1024)),
        sa.Column("mime_type", sa.String(100)),
        sa.Column("size_bytes", sa.BigInteger()),
        sa.Column("sha256", sa.String(64)),
        sa.Column("width", sa.Integer()),
        sa.Column("height", sa.Integer()),
        sa.Column("duration_ms", sa.BigInteger()),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        *timestamp_columns(),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "(scope = 'private' AND user_id IS NOT NULL) OR (scope = 'system' AND user_id IS NULL)",
            name="ck_assets_scope_owner",
        ),
        sa.CheckConstraint("kind IN ('image', 'video', 'audio')", name="ck_assets_kind"),
        sa.CheckConstraint("source IN ('upload', 'generated', 'system')", name="ck_assets_source"),
        sa.CheckConstraint(
            "status IN ('pending', 'processing', 'ready', 'failed')",
            name="ck_assets_status",
        ),
        sa.CheckConstraint(
            "size_bytes IS NULL OR size_bytes >= 0", name="ck_assets_size_nonnegative"
        ),
        sa.CheckConstraint("width IS NULL OR width > 0", name="ck_assets_width_positive"),
        sa.CheckConstraint("height IS NULL OR height > 0", name="ck_assets_height_positive"),
        sa.CheckConstraint(
            "duration_ms IS NULL OR duration_ms >= 0", name="ck_assets_duration_nonnegative"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_assets_user_id_users", ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_assets"),
        sa.UniqueConstraint("storage_key", name="uq_assets_storage_key"),
    )
    op.create_index("ix_assets_user_id_created_at", "assets", ["user_id", "created_at"])
    op.create_index(
        "ix_assets_user_id_kind_created_at", "assets", ["user_id", "kind", "created_at"]
    )
    op.create_index("ix_assets_user_id_status", "assets", ["user_id", "status"])
    op.create_index("ix_assets_user_id_sha256", "assets", ["user_id", "sha256"])
    op.create_foreign_key(
        "fk_projects_thumbnail_asset_id_assets",
        "projects",
        "assets",
        ["thumbnail_asset_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "tags",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("name_normalized", sa.String(100), nullable=False),
        sa.Column("color", sa.String(20)),
        *timestamp_columns(),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_tags_user_id_users", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_tags"),
        sa.UniqueConstraint("user_id", "name_normalized", name="uq_tags_user_name_normalized"),
    )
    op.create_index("ix_tags_user_id_name", "tags", ["user_id", "name"])
    op.create_table(
        "asset_tags",
        sa.Column("asset_id", sa.Uuid(), nullable=False),
        sa.Column("tag_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["asset_id"], ["assets.id"], name="fk_asset_tags_asset_id_assets", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"], ["tags.id"], name="fk_asset_tags_tag_id_tags", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_asset_tags_user_id_users", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("asset_id", "tag_id", name="pk_asset_tags"),
    )
    op.create_index("ix_asset_tags_user_id_tag_id", "asset_tags", ["user_id", "tag_id"])
    op.create_table(
        "asset_derivatives",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("asset_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid()),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("parameters_hash", sa.String(64), nullable=False),
        sa.Column("storage_key", sa.String(1024)),
        sa.Column("mime_type", sa.String(100)),
        sa.Column("size_bytes", sa.BigInteger()),
        sa.Column("width", sa.Integer()),
        sa.Column("height", sa.Integer()),
        sa.Column("duration_ms", sa.BigInteger()),
        sa.Column("error_code", sa.String(100)),
        *timestamp_columns(),
        sa.CheckConstraint(
            "kind IN ('thumbnail', 'proxy', 'waveform')", name="ck_asset_derivatives_kind"
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'processing', 'ready', 'failed')",
            name="ck_asset_derivatives_status",
        ),
        sa.ForeignKeyConstraint(
            ["asset_id"],
            ["assets.id"],
            name="fk_asset_derivatives_asset_id_assets",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_asset_derivatives_user_id_users",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_asset_derivatives"),
        sa.UniqueConstraint(
            "asset_id",
            "kind",
            "parameters_hash",
            name="uq_asset_derivatives_variant",
        ),
        sa.UniqueConstraint("storage_key", name="uq_asset_derivatives_storage_key"),
    )
    op.create_index(
        "ix_asset_derivatives_user_id_status",
        "asset_derivatives",
        ["user_id", "status"],
    )


def downgrade() -> None:
    op.drop_table("asset_derivatives")
    op.drop_table("asset_tags")
    op.drop_table("tags")
    op.drop_constraint("fk_projects_thumbnail_asset_id_assets", "projects", type_="foreignkey")
    op.drop_table("assets")
