import asyncio
from collections.abc import AsyncIterator
from hashlib import sha256
from pathlib import Path

import aiofiles

from douga.core.errors import ApplicationError, NotFoundError


class LocalStorage:
    def __init__(self, root: Path, max_bytes: int) -> None:
        self.root = root.resolve()
        self.max_bytes = max_bytes

    def path_for(self, storage_key: str) -> Path:
        path = (self.root / storage_key).resolve()
        if self.root not in path.parents:
            raise ApplicationError("STORAGE_KEY_INVALID", "errors.uploadInvalid", 400)
        return path

    async def write(self, storage_key: str, chunks: AsyncIterator[bytes]) -> tuple[int, str]:
        path = self.path_for(storage_key)
        partial = path.with_suffix(".part")
        await asyncio.to_thread(path.parent.mkdir, parents=True, exist_ok=True)
        digest = sha256()
        size = 0
        try:
            async with aiofiles.open(partial, "wb") as stream:
                async for chunk in chunks:
                    size += len(chunk)
                    if size > self.max_bytes:
                        raise ApplicationError("UPLOAD_TOO_LARGE", "errors.uploadTooLarge", 413)
                    digest.update(chunk)
                    await stream.write(chunk)
            if size == 0:
                raise ApplicationError("UPLOAD_EMPTY", "errors.uploadInvalid", 400)
            await asyncio.to_thread(partial.replace, path)
        except Exception:
            if partial.exists():
                await asyncio.to_thread(partial.unlink)
            raise
        return size, digest.hexdigest()

    async def delete(self, storage_key: str) -> None:
        path = self.path_for(storage_key)
        if path.exists():
            await asyncio.to_thread(path.unlink)

    def require_path(self, storage_key: str) -> Path:
        path = self.path_for(storage_key)
        if not path.is_file():
            raise NotFoundError("ASSET_CONTENT_NOT_FOUND", "errors.assetNotFound")
        return path
