from __future__ import annotations

from pathlib import Path

from scripts.douga.client import DougaClient


def upload_assets(client: DougaClient, assets: list[tuple[Path, str]]) -> list[dict[str, object]]:
    return [client.upload_asset(path, kind) for path, kind in assets]
