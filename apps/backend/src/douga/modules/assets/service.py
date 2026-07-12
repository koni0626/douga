import asyncio
import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path
from typing import Literal
from uuid import UUID, uuid4

from PIL import Image, UnidentifiedImageError
from sqlalchemy.ext.asyncio import AsyncSession

from douga.core.config import get_settings
from douga.core.errors import ApplicationError, ConflictError, NotFoundError
from douga.db.unit_of_work import UnitOfWork
from douga.modules.assets.models import Asset
from douga.modules.assets.repository import AssetRepository
from douga.modules.assets.storage import LocalStorage

AssetKind = Literal["image", "video", "audio"]


@dataclass(frozen=True, slots=True)
class AssetView:
    id: UUID
    kind: str
    source: str
    status: str
    name: str
    original_filename: str | None
    mime_type: str | None
    size_bytes: int | None
    width: int | None
    height: int | None
    duration_ms: int | None
    tags: list[str]


@dataclass(frozen=True, slots=True)
class AssetList:
    items: list[AssetView]
    total: int


@dataclass(frozen=True, slots=True)
class UploadTarget:
    asset: AssetView
    upload_path: str


class AssetService:
    def __init__(self, session: AsyncSession) -> None:
        settings = get_settings()
        self.repository = AssetRepository(session)
        self.settings = settings
        self.storage = LocalStorage(
            settings.local_storage_path,
            max(
                settings.max_upload_bytes,
                settings.max_image_upload_bytes,
                settings.max_audio_upload_bytes,
                settings.max_video_upload_bytes,
            ),
        )
        self.uow = UnitOfWork(session)
        self.ffprobe_path = settings.ffprobe_path

    async def begin_upload(
        self,
        user_id: UUID,
        *,
        name: str,
        original_filename: str,
        kind: AssetKind,
        content_type: str | None = None,
        expected_size_bytes: int | None = None,
        expected_sha256: str | None = None,
    ) -> UploadTarget:
        if (
            await self.repository.active_upload_count(user_id)
            >= self.settings.max_concurrent_uploads
        ):
            raise ApplicationError("UPLOAD_CONCURRENCY_EXCEEDED", "errors.rateLimited", 429)
        max_bytes = self._max_bytes(kind)
        if expected_size_bytes is not None and expected_size_bytes > max_bytes:
            raise ApplicationError("UPLOAD_TOO_LARGE", "errors.uploadTooLarge", 413)
        asset_id = uuid4()
        storage_key = f"users/{user_id}/assets/{asset_id}/original"
        asset = Asset(
            id=asset_id,
            user_id=user_id,
            scope="private",
            kind=kind,
            source="upload",
            status="pending",
            name=name,
            original_filename=Path(original_filename).name[:255],
            storage_key=storage_key,
            asset_metadata={
                "expected_content_type": content_type,
                "expected_size_bytes": expected_size_bytes,
                "expected_sha256": expected_sha256.casefold() if expected_sha256 else None,
            },
        )
        await self.repository.add(asset)
        await self.uow.commit()
        return UploadTarget(await self._view(asset), f"/api/v1/assets/{asset_id}/content")

    async def store_upload(
        self, asset_id: UUID, user_id: UUID, chunks: AsyncIterator[bytes]
    ) -> AssetView:
        asset = await self._pending_owned(asset_id, user_id)
        if not asset.storage_key:
            raise ConflictError("ASSET_STORAGE_MISSING", "errors.uploadInvalid")
        size, digest = await self.storage.write(asset.storage_key, chunks)
        expected_size = asset.asset_metadata.get("expected_size_bytes")
        expected_digest = asset.asset_metadata.get("expected_sha256")
        if size > self._max_bytes(asset.kind) or (
            expected_size is not None and size != int(expected_size)
        ):
            await self.storage.delete(asset.storage_key)
            asset.status = "failed"
            await self.uow.commit()
            raise ApplicationError("UPLOAD_SIZE_MISMATCH", "errors.uploadInvalid", 422)
        if expected_digest is not None and digest != str(expected_digest).casefold():
            await self.storage.delete(asset.storage_key)
            asset.status = "failed"
            await self.uow.commit()
            raise ApplicationError("UPLOAD_HASH_MISMATCH", "errors.uploadInvalid", 422)
        asset.size_bytes = size
        asset.sha256 = digest
        asset.status = "processing"
        await self.uow.commit()
        return await self._view(asset)

    async def complete_upload(self, asset_id: UUID, user_id: UUID) -> AssetView:
        asset = await self._owned(asset_id, user_id)
        if asset.status != "processing" or not asset.storage_key:
            raise ConflictError("UPLOAD_NOT_READY", "errors.uploadInvalid")
        path = self.storage.require_path(asset.storage_key)
        try:
            if asset.kind == "image":
                mime_type, width, height = await asyncio.to_thread(self._inspect_image, path)
                asset.mime_type = mime_type
                asset.width = width
                asset.height = height
            else:
                await self._inspect_media(asset, path)
            expected_type = asset.asset_metadata.get("expected_content_type")
            if expected_type is not None and asset.mime_type != expected_type:
                raise ApplicationError("MEDIA_TYPE_MISMATCH", "errors.uploadInvalid", 422)
            asset.status = "ready"
            await self.uow.commit()
        except (ApplicationError, UnidentifiedImageError, OSError, ValueError) as error:
            asset.status = "failed"
            await self.uow.commit()
            if isinstance(error, ApplicationError):
                raise
            raise ApplicationError("ASSET_INVALID", "errors.uploadInvalid", 422) from error
        return await self._view(asset)

    async def list_assets(
        self,
        user_id: UUID,
        *,
        search: str | None = None,
        kind: str | None = None,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> AssetList:
        assets, total = await self.repository.list_owned(
            user_id, search=search, kind=kind, status=status, limit=limit, offset=offset
        )
        tags = await self.repository.tags_for([asset.id for asset in assets])
        return AssetList(
            [self._view_sync(asset, tags.get(asset.id, [])) for asset in assets], total
        )

    async def get_asset(self, asset_id: UUID, user_id: UUID) -> AssetView:
        return await self._view(await self._owned(asset_id, user_id))

    async def update_asset(
        self, asset_id: UUID, user_id: UUID, *, name: str | None, tags: list[str] | None
    ) -> AssetView:
        asset = await self._owned(asset_id, user_id)
        if name is not None:
            asset.name = name
        if tags is not None:
            await self.repository.set_tags(asset_id, user_id, tags)
        await self.uow.commit()
        return await self._view(asset)

    async def delete_asset(self, asset_id: UUID, user_id: UUID) -> None:
        asset = await self._owned(asset_id, user_id)
        await self.repository.soft_delete(asset)
        await self.uow.commit()

    async def content_path(self, asset_id: UUID, user_id: UUID) -> tuple[Path, str]:
        asset = await self._owned(asset_id, user_id)
        if asset.status != "ready" or not asset.storage_key:
            raise NotFoundError("ASSET_NOT_FOUND", "errors.assetNotFound")
        return self.storage.require_path(
            asset.storage_key
        ), asset.mime_type or "application/octet-stream"

    async def assert_references_available(self, user_id: UUID, asset_ids: set[UUID]) -> None:
        available = await self.repository.ready_owned_ids(user_id, asset_ids)
        if available != asset_ids:
            raise NotFoundError("ASSET_NOT_FOUND", "errors.assetNotFound")

    async def assert_ready_kind(
        self, asset_id: UUID, user_id: UUID, expected_kind: AssetKind
    ) -> None:
        asset = await self._owned(asset_id, user_id)
        if asset.status != "ready" or asset.kind != expected_kind:
            raise NotFoundError("ASSET_NOT_FOUND", "errors.assetNotFound")

    async def _owned(self, asset_id: UUID, user_id: UUID) -> Asset:
        asset = await self.repository.get_owned(asset_id, user_id)
        if asset is None:
            raise NotFoundError("ASSET_NOT_FOUND", "errors.assetNotFound")
        return asset

    async def _pending_owned(self, asset_id: UUID, user_id: UUID) -> Asset:
        asset = await self._owned(asset_id, user_id)
        if asset.status != "pending":
            raise ConflictError("UPLOAD_ALREADY_RECEIVED", "errors.uploadInvalid")
        return asset

    async def _view(self, asset: Asset) -> AssetView:
        tags = await self.repository.tags_for([asset.id])
        return self._view_sync(asset, tags.get(asset.id, []))

    @staticmethod
    def _view_sync(asset: Asset, tags: list[str]) -> AssetView:
        return AssetView(
            id=asset.id,
            kind=asset.kind,
            source=asset.source,
            status=asset.status,
            name=asset.name,
            original_filename=asset.original_filename,
            mime_type=asset.mime_type,
            size_bytes=asset.size_bytes,
            width=asset.width,
            height=asset.height,
            duration_ms=asset.duration_ms,
            tags=tags,
        )

    def _inspect_image(self, path: Path) -> tuple[str, int, int]:
        mime_types = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}
        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            if image.format not in mime_types:
                raise ApplicationError("IMAGE_FORMAT_UNSUPPORTED", "errors.uploadInvalid", 422)
            if image.width * image.height > self.settings.max_image_pixels:
                raise ApplicationError("IMAGE_DIMENSIONS_TOO_LARGE", "errors.uploadInvalid", 422)
            return mime_types[image.format], image.width, image.height

    async def _inspect_media(self, asset: Asset, path: Path) -> None:
        process = await asyncio.create_subprocess_exec(
            self.ffprobe_path,
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            str(path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await process.communicate()
        if process.returncode != 0:
            raise ApplicationError("MEDIA_INVALID", "errors.uploadInvalid", 422)
        probe = json.loads(stdout)
        streams = probe.get("streams", [])
        expected_type = "video" if asset.kind == "video" else "audio"
        stream = next((item for item in streams if item.get("codec_type") == expected_type), None)
        if stream is None:
            raise ApplicationError("MEDIA_KIND_MISMATCH", "errors.uploadInvalid", 422)
        duration = stream.get("duration") or probe.get("format", {}).get("duration")
        asset.duration_ms = round(float(duration) * 1000) if duration is not None else None
        if asset.duration_ms is not None:
            maximum = (
                self.settings.max_video_duration_ms
                if asset.kind == "video"
                else self.settings.max_audio_duration_ms
            )
            if asset.duration_ms > maximum:
                raise ApplicationError("MEDIA_DURATION_TOO_LONG", "errors.uploadInvalid", 422)
        asset.width = int(stream["width"]) if stream.get("width") else None
        asset.height = int(stream["height"]) if stream.get("height") else None
        format_name = str(probe.get("format", {}).get("format_name", ""))
        if asset.kind == "video":
            asset.mime_type = "video/webm" if "webm" in format_name else "video/mp4"
        else:
            asset.mime_type = "audio/wav" if "wav" in format_name else "audio/mpeg"
        asset.asset_metadata = {
            **asset.asset_metadata,
            "codec_name": stream.get("codec_name"),
            "format_name": format_name,
        }

    def _max_bytes(self, kind: str) -> int:
        return {
            "image": self.settings.max_image_upload_bytes,
            "audio": self.settings.max_audio_upload_bytes,
            "video": self.settings.max_video_upload_bytes,
        }[kind]
