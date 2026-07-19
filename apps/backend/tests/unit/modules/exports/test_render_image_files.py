from uuid import uuid4

from douga.modules.assets.models import Asset
from douga.modules.assets.storage import LocalStorage
from douga.modules.exports.service import build_render_image_files


def test_render_image_files_reference_local_files_without_embedding_bytes(tmp_path) -> None:
    storage = LocalStorage(tmp_path, max_bytes=10_000)
    storage_key = "users/test/assets/image.png"
    image_path = storage.path_for(storage_key)
    image_path.parent.mkdir(parents=True)
    image_path.write_bytes(b"large image contents")
    image = Asset(
        id=uuid4(),
        user_id=uuid4(),
        scope="private",
        kind="image",
        source="upload",
        status="ready",
        name="image.png",
        storage_key=storage_key,
        mime_type="image/png",
    )

    result = build_render_image_files({image.id: image}, storage)

    assert result == {
        str(image.id): {
            "path": str(image_path),
            "mime_type": "image/png",
        }
    }
    assert "data:" not in str(result)


def test_render_image_files_excludes_audio_assets(tmp_path) -> None:
    storage = LocalStorage(tmp_path, max_bytes=10_000)
    audio = Asset(
        id=uuid4(),
        user_id=uuid4(),
        scope="private",
        kind="audio",
        source="upload",
        status="ready",
        name="audio.mp3",
        storage_key="users/test/assets/audio.mp3",
        mime_type="audio/mpeg",
    )

    assert build_render_image_files({audio.id: audio}, storage) == {}
