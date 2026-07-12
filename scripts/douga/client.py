from __future__ import annotations

import hashlib
import json
import mimetypes
import os
from collections.abc import Callable
from pathlib import Path
from time import sleep
from typing import Any
from uuid import uuid4

import httpx


class DougaApiError(RuntimeError):
    def __init__(
        self,
        status_code: int,
        code: str,
        message_key: str,
        *,
        request_id: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        suffix = f" [request_id={request_id}]" if request_id else ""
        super().__init__(f"Douga API error {status_code}: {code} ({message_key}){suffix}")
        self.status_code = status_code
        self.code = code
        self.message_key = message_key
        self.request_id = request_id
        self.details = details or {}


class DougaClient:
    def __init__(
        self,
        base_url: str,
        token: str,
        *,
        timeout: float = 120,
        max_retries: int = 3,
        web_url: str = "http://127.0.0.1:5173",
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.web_url = web_url.rstrip("/")
        self.max_retries = max_retries
        self.operation_ids: list[str] = []
        self.client = httpx.Client(
            base_url=self.base_url,
            headers={"Authorization": f"Bearer {token}", "X-Douga-Source": "codex"},
            timeout=timeout,
        )

    @classmethod
    def from_env(cls) -> DougaClient:
        base_url = os.getenv("DOUGA_API_URL", "http://127.0.0.1:8000/api/v1")
        token = os.getenv("DOUGA_API_TOKEN")
        if not token:
            raise RuntimeError("DOUGA_API_TOKEN is not configured")
        return cls(base_url, token, web_url=os.getenv("DOUGA_WEB_URL", "http://127.0.0.1:5173"))

    def editor_url(self, project_id: str) -> str:
        return f"{self.web_url}/projects/{project_id}"

    def close(self) -> None:
        self.client.close()

    def __enter__(self) -> DougaClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def create_project(
        self,
        name: str,
        locale: str = "ja",
        *,
        aspect_ratio: str | None = None,
        key: str | None = None,
    ) -> dict[str, Any]:
        payload = {"name": name, "content_locale": locale}
        if aspect_ratio is not None:
            payload["aspect_ratio"] = aspect_ratio
        return self._request(
            "POST",
            "/projects",
            json=payload,
            idempotency_key=key,
        )

    def get_project(self, project_id: str) -> dict[str, Any]:
        return self._request("GET", f"/projects/{project_id}")

    def upload_asset(self, path: Path, kind: str, *, name: str | None = None) -> dict[str, Any]:
        if not path.is_file():
            raise FileNotFoundError(path)
        digest = self.sha256_file(path)
        size_bytes = path.stat().st_size
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        key_base = f"asset-{kind}-{digest[:32]}"
        payload = {
            "name": name or path.stem,
            "original_filename": path.name,
            "kind": kind,
            "content_type": content_type,
            "size_bytes": size_bytes,
            "sha256": digest,
        }
        started = self._request(
            "POST", "/assets/uploads", json=payload, idempotency_key=f"{key_base}-begin"
        )
        asset_id = started["asset"]["id"]
        current = self._request("GET", f"/assets/{asset_id}")
        if current["status"] == "ready":
            return current
        if current["status"] == "failed":
            started = self._request(
                "POST",
                "/assets/uploads",
                json=payload,
                idempotency_key=f"{key_base}-retry-{uuid4()}",
            )
            asset_id = started["asset"]["id"]
            current = started["asset"]
        if current["status"] == "pending":
            current = self._upload_file(
                f"/assets/{asset_id}/content",
                path,
                headers={"Content-Type": content_type, "X-Content-SHA256": digest},
            )
        if current["status"] == "processing":
            return self._request(
                "POST",
                f"/assets/{asset_id}/complete",
                idempotency_key=f"{key_base}-complete",
            )
        raise RuntimeError(f"unexpected upload status: {current['status']}")

    def validate_project(self, project_id: str, document: dict[str, Any]) -> dict[str, Any]:
        return self._request(
            "POST",
            f"/projects/{project_id}/validate",
            json={"document": document},
            idempotency_key=f"validate-{uuid4()}",
        )

    def save_revision(
        self,
        project_id: str,
        lock_version: int,
        document: dict[str, Any],
        *,
        change_summary: str,
        key: str | None = None,
    ) -> dict[str, Any]:
        return self._request(
            "POST",
            f"/projects/{project_id}/revisions",
            json={
                "lock_version": lock_version,
                "document": document,
                "change_summary": change_summary,
            },
            idempotency_key=key,
        )

    def save_storyboard(self, project_id: str, content: dict[str, Any]) -> dict[str, Any]:
        digest = hashlib.sha256(
            json.dumps(content, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode(
                "utf-8"
            )
        ).hexdigest()[:32]
        return self._request(
            "POST",
            f"/projects/{project_id}/creative-documents",
            json={"kind": "storyboard", "status": "draft", "content": content},
            idempotency_key=f"storyboard-{project_id}-{digest}",
        )

    def render_preview(self, project_id: str, *, start_ms: int, end_ms: int) -> dict[str, Any]:
        return self._request(
            "POST",
            f"/projects/{project_id}/previews",
            json={"range_start_ms": start_ms, "range_end_ms": end_ms},
            idempotency_key=f"preview-{project_id}-{start_ms}-{end_ms}",
        )

    def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict[str, Any] | None = None,
        content: bytes | None = None,
        headers: dict[str, str] | None = None,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        request_headers = dict(headers or {})
        if method == "POST":
            request_headers["Idempotency-Key"] = idempotency_key or str(uuid4())
        response = self._send_with_retry(
            lambda: self.client.request(
                method, path, json=json, content=content, headers=request_headers
            )
        )
        self._remember_operation(response)
        if not response.is_success:
            payload = self._json(response)
            error = payload.get("error", {})
            raise DougaApiError(
                response.status_code,
                str(error.get("code", "UNKNOWN_ERROR")),
                str(error.get("message_key", "errors.unknown")),
                request_id=str(error["request_id"]) if error.get("request_id") else None,
                details=error.get("details") if isinstance(error.get("details"), dict) else None,
            )
        return self._json(response)

    def _upload_file(
        self, path: str, file_path: Path, *, headers: dict[str, str]
    ) -> dict[str, Any]:
        def send() -> httpx.Response:
            with file_path.open("rb") as stream:
                return self.client.request("PUT", path, content=stream, headers=headers)

        response = self._send_with_retry(send)
        self._remember_operation(response)
        if not response.is_success:
            payload = self._json(response)
            error = payload.get("error", {})
            raise DougaApiError(
                response.status_code,
                str(error.get("code", "UNKNOWN_ERROR")),
                str(error.get("message_key", "errors.unknown")),
                request_id=str(error["request_id"]) if error.get("request_id") else None,
                details=error.get("details") if isinstance(error.get("details"), dict) else None,
            )
        return self._json(response)

    def _send_with_retry(self, send: Callable[[], httpx.Response]) -> httpx.Response:
        retry_statuses = {429, 502, 503, 504}
        for attempt in range(self.max_retries + 1):
            try:
                response = send()
            except httpx.TransportError:
                if attempt >= self.max_retries:
                    raise
                sleep(min(2**attempt, 8))
                continue
            if response.status_code not in retry_statuses or attempt >= self.max_retries:
                return response
            retry_after = response.headers.get("Retry-After")
            try:
                delay = float(retry_after) if retry_after is not None else 2**attempt
            except ValueError:
                delay = 2**attempt
            sleep(max(0, min(delay, 30)))
        raise RuntimeError("unreachable retry state")

    def _remember_operation(self, response: httpx.Response) -> None:
        operation_id = response.headers.get("X-Automation-Operation-ID")
        if operation_id:
            self.operation_ids.append(operation_id)

    @staticmethod
    def sha256_file(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    @staticmethod
    def _json(response: httpx.Response) -> dict[str, Any]:
        if not response.content:
            return {}
        payload = response.json()
        return payload if isinstance(payload, dict) else {"items": payload}
