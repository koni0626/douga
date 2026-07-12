from __future__ import annotations

from typing import Any

from scripts.douga.client import DougaClient


def validate_project(
    client: DougaClient, project_id: str, document: dict[str, Any]
) -> dict[str, Any]:
    return client.validate_project(project_id, document)
