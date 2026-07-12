from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from douga.modules.assets.models import Asset, AssetTag, Tag


class AssetRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, asset: Asset) -> None:
        self.session.add(asset)
        await self.session.flush()

    async def active_upload_count(self, user_id: UUID) -> int:
        return int(
            await self.session.scalar(
                select(func.count(Asset.id)).where(
                    Asset.user_id == user_id,
                    Asset.source == "upload",
                    Asset.status.in_(("pending", "processing")),
                    Asset.deleted_at.is_(None),
                )
            )
            or 0
        )

    async def get_owned(self, asset_id: UUID, user_id: UUID) -> Asset | None:
        statement = select(Asset).where(
            Asset.id == asset_id,
            Asset.user_id == user_id,
            Asset.scope == "private",
            Asset.deleted_at.is_(None),
        )
        return (await self.session.scalars(statement)).one_or_none()

    async def list_owned(
        self,
        user_id: UUID,
        *,
        search: str | None,
        kind: str | None,
        status: str | None,
        limit: int,
        offset: int,
    ) -> tuple[list[Asset], int]:
        statement = select(Asset).where(
            Asset.user_id == user_id,
            Asset.scope == "private",
            Asset.deleted_at.is_(None),
        )
        if search:
            statement = statement.where(Asset.name.ilike(f"%{search}%"))
        if kind:
            statement = statement.where(Asset.kind == kind)
        if status:
            statement = statement.where(Asset.status == status)
        total = int(
            (await self.session.scalar(select(func.count()).select_from(statement.subquery()))) or 0
        )
        assets = await self.session.scalars(
            statement.order_by(Asset.created_at.desc()).limit(limit).offset(offset)
        )
        return list(assets), total

    async def tags_for(self, asset_ids: list[UUID]) -> dict[UUID, list[str]]:
        if not asset_ids:
            return {}
        rows = await self.session.execute(
            select(AssetTag.asset_id, Tag.name)
            .join(Tag, Tag.id == AssetTag.tag_id)
            .where(AssetTag.asset_id.in_(asset_ids))
            .order_by(Tag.name)
        )
        result: dict[UUID, list[str]] = {asset_id: [] for asset_id in asset_ids}
        for asset_id, name in rows:
            result[asset_id].append(name)
        return result

    async def set_tags(self, asset_id: UUID, user_id: UUID, names: list[str]) -> None:
        normalized_names = {name.strip().casefold(): name.strip() for name in names if name.strip()}
        existing = await self.session.scalars(
            select(Tag).where(
                Tag.user_id == user_id, Tag.name_normalized.in_(normalized_names.keys())
            )
        )
        tags = {tag.name_normalized: tag for tag in existing}
        for normalized, name in normalized_names.items():
            if normalized not in tags:
                tag = Tag(user_id=user_id, name=name, name_normalized=normalized)
                self.session.add(tag)
                tags[normalized] = tag
        await self.session.flush()
        await self.session.execute(delete(AssetTag).where(AssetTag.asset_id == asset_id))
        self.session.add_all(
            AssetTag(asset_id=asset_id, tag_id=tags[key].id, user_id=user_id)
            for key in normalized_names
        )

    async def soft_delete(self, asset: Asset) -> None:
        asset.deleted_at = datetime.now(UTC)
        await self.session.flush()

    async def ready_owned_ids(self, user_id: UUID, asset_ids: set[UUID]) -> set[UUID]:
        if not asset_ids:
            return set()
        result = await self.session.scalars(
            select(Asset.id).where(
                Asset.id.in_(asset_ids),
                Asset.user_id == user_id,
                Asset.scope == "private",
                Asset.status == "ready",
                Asset.deleted_at.is_(None),
            )
        )
        return set(result)
