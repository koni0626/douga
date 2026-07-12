import json
from hashlib import sha256
from typing import Any

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from douga.core.config import get_settings
from douga.core.errors import ApplicationError
from douga.db.session import session_factory
from douga.modules.api_tokens.repository import ApiTokenRepository
from douga.modules.api_tokens.service import hash_api_token
from douga.modules.automation.service import AutomationService


class AutomationMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        token = self._bearer_token(request)
        if (
            request.method != "POST"
            or token is None
            or request.cookies.get(get_settings().session_cookie_name) is not None
        ):
            return await call_next(request)

        async with session_factory() as session:
            authenticated = await ApiTokenRepository(session).get_active_with_user(
                hash_api_token(token)
            )
        if authenticated is None:
            return await call_next(request)
        api_token, user = authenticated
        key = request.headers.get("Idempotency-Key")
        if key is None or not 16 <= len(key) <= 200:
            return self._error(
                ApplicationError("IDEMPOTENCY_KEY_REQUIRED", "errors.idempotencyKeyRequired", 400),
                request,
            )

        body = await request.body()
        request_hash = sha256(body).hexdigest()
        try:
            async with session_factory() as session:
                reservation = await AutomationService(session).reserve(
                    user.id,
                    method=request.method,
                    path=request.url.path,
                    key=key,
                    request_hash=request_hash,
                )
        except ApplicationError as error:
            return self._error(error, request)
        if reservation.replay_body is not None:
            async with session_factory() as session:
                operation = await AutomationService(session).record_operation(
                    user_id=user.id,
                    api_token_id=api_token.id,
                    source=request.headers.get("X-Douga-Source", "api"),
                    external_run_id=request.headers.get("X-Request-ID"),
                    operation_type=self._operation_type(request.url.path),
                    status_code=reservation.replay_status or 200,
                    response_json=reservation.replay_body,
                )
            return JSONResponse(
                reservation.replay_body,
                status_code=reservation.replay_status or 200,
                headers={
                    "X-Idempotent-Replay": "true",
                    "X-Automation-Operation-ID": str(operation.id),
                },
            )

        try:
            response = await call_next(request)
        except Exception:
            async with session_factory() as session:
                await AutomationService(session).abandon(reservation.record_id)
            raise
        response_body = await self._response_body(response)
        parsed = self._json_object(response_body)
        if parsed is not None:
            async with session_factory() as session:
                service = AutomationService(session)
                if response.status_code == 429 or response.status_code >= 500:
                    await service.abandon(reservation.record_id)
                else:
                    await service.finalize(
                        reservation.record_id,
                        status_code=response.status_code,
                        response_json=parsed,
                    )
                operation = await service.record_operation(
                    user_id=user.id,
                    api_token_id=api_token.id,
                    source=request.headers.get("X-Douga-Source", "api"),
                    external_run_id=request.headers.get("X-Request-ID"),
                    operation_type=self._operation_type(request.url.path),
                    status_code=response.status_code,
                    response_json=parsed,
                )
            response.headers["X-Automation-Operation-ID"] = str(operation.id)
        return Response(
            content=response_body,
            status_code=response.status_code,
            headers=dict(response.headers),
            media_type=response.media_type,
            background=response.background,
        )

    @staticmethod
    def _bearer_token(request: Request) -> str | None:
        authorization = request.headers.get("Authorization")
        if not authorization:
            return None
        scheme, separator, token = authorization.partition(" ")
        if scheme.casefold() != "bearer" or not separator or not token.strip():
            return None
        return token.strip()

    @staticmethod
    async def _response_body(response: Response) -> bytes:
        parts: list[bytes] = []
        async for chunk in response.body_iterator:  # type: ignore[attr-defined]
            parts.append(chunk.encode() if isinstance(chunk, str) else chunk)
        return b"".join(parts)

    @staticmethod
    def _json_object(body: bytes) -> dict[str, Any] | None:
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError, UnicodeDecodeError:
            return None
        return parsed if isinstance(parsed, dict) else None

    @staticmethod
    def _operation_type(path: str) -> str:
        relative = path.removeprefix("/api/v1/")
        segments = relative.split("/")
        if relative == "projects":
            return "project_create"
        if len(segments) >= 3 and segments[0] == "projects":
            if segments[2] == "revisions":
                return "project_revision_save"
            if segments[2] == "validate":
                return "project_validate"
            if segments[2] == "duplicate":
                return "project_duplicate"
            if segments[2] == "creative-documents":
                return "creative_document_save"
            if segments[2] == "previews":
                return "preview_create"
        if relative == "assets/uploads":
            return "asset_upload_begin"
        if len(segments) == 3 and segments[0] == "assets" and segments[2] == "complete":
            return "asset_upload_complete"
        if relative == "image-generations":
            return "image_generation_create"
        if relative == "exports":
            return "export_create"
        return f"post:{relative}"[:100]

    @staticmethod
    def _error(error: ApplicationError, request: Request) -> JSONResponse:
        return JSONResponse(
            status_code=error.status_code,
            content={
                "error": {
                    "code": error.code,
                    "message_key": error.message_key,
                    "request_id": request.headers.get("X-Request-ID", "automation"),
                }
            },
        )
