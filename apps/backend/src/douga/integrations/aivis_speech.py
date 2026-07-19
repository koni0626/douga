import asyncio
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

import httpx

from douga.core.config import Settings, get_settings
from douga.core.errors import ApplicationError


@dataclass(frozen=True, slots=True)
class AivisVoiceStyle:
    id: int
    name: str


@dataclass(frozen=True, slots=True)
class AivisVoice:
    speaker_uuid: str
    name: str
    styles: tuple[AivisVoiceStyle, ...]


class AivisProcessManager:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._lock = asyncio.Lock()
        self._process: subprocess.Popen[bytes] | None = None

    async def ensure_started(self, client: httpx.AsyncClient) -> None:
        if await self._is_available(client):
            return
        async with self._lock:
            if await self._is_available(client):
                return
            if not self.settings.aivis_auto_start:
                raise _unavailable()
            executable = self._resolve_executable()
            parsed = urlparse(self.settings.aivis_base_url)
            if executable is None or parsed.hostname not in {"127.0.0.1", "localhost"}:
                raise _unavailable()
            command = [
                str(executable),
                "--host",
                "127.0.0.1",
                "--disable_mutable_api",
            ]
            if parsed.port is not None:
                command.extend(["--port", str(parsed.port)])
            creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0
            try:
                self._process = await asyncio.to_thread(_start_process, command, creation_flags)
            except OSError as error:
                raise _unavailable() from error
            deadline = (
                asyncio.get_running_loop().time() + self.settings.aivis_startup_timeout_seconds
            )
            while asyncio.get_running_loop().time() < deadline:
                if self._process.poll() is not None:
                    raise _unavailable()
                if await self._is_available(client):
                    return
                await asyncio.sleep(1)
            await asyncio.to_thread(_terminate_process, self._process)
            raise _unavailable()

    async def _is_available(self, client: httpx.AsyncClient) -> bool:
        try:
            response = await client.get("/version", timeout=2)
            return response.is_success
        except httpx.HTTPError:
            return False

    def _resolve_executable(self) -> Path | None:
        candidates: list[Path] = []
        if self.settings.aivis_engine_path is not None:
            candidates.append(self.settings.aivis_engine_path)
        if os.name == "nt":
            candidates.append(Path("C:/Program Files/AivisSpeech/AivisSpeech-Engine/run.exe"))
            local_app_data = os.getenv("LOCALAPPDATA")
            if local_app_data:
                candidates.append(
                    Path(local_app_data) / "Programs/AivisSpeech/AivisSpeech-Engine/run.exe"
                )
        return next((candidate.resolve() for candidate in candidates if candidate.is_file()), None)


class AivisSpeechClient:
    def __init__(
        self,
        settings: Settings | None = None,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        process_manager: AivisProcessManager | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self._transport = transport
        self._process_manager = process_manager or AivisProcessManager(self.settings)

    async def list_voices(self) -> tuple[AivisVoice, ...]:
        async with self._client() as client:
            await self._process_manager.ensure_started(client)
            response = await self._request(client, "GET", "/speakers")
        try:
            payload = response.json()
            if not isinstance(payload, list):
                raise ValueError("speakers response must be a list")
            voices: list[AivisVoice] = []
            for item in payload:
                styles = tuple(
                    AivisVoiceStyle(id=int(style["id"]), name=str(style["name"])[:100])
                    for style in item["styles"]
                )
                voices.append(
                    AivisVoice(
                        speaker_uuid=str(item["speaker_uuid"])[:100],
                        name=str(item["name"])[:100],
                        styles=styles,
                    )
                )
            return tuple(voices)
        except (KeyError, TypeError, ValueError) as error:
            raise _invalid_response() from error

    async def synthesize(
        self,
        *,
        text: str,
        style_id: int,
        speed_scale: float,
        intonation_scale: float,
        tempo_dynamics_scale: float,
        volume_scale: float,
    ) -> bytes:
        async with self._client() as client:
            await self._process_manager.ensure_started(client)
            query_response = await self._request(
                client,
                "POST",
                "/audio_query",
                params={"text": text, "speaker": style_id},
            )
            try:
                query = query_response.json()
                if not isinstance(query, dict):
                    raise ValueError("audio query response must be an object")
            except (ValueError, TypeError) as error:
                raise _invalid_response() from error
            query.update(
                {
                    "speedScale": speed_scale,
                    "intonationScale": intonation_scale,
                    "tempoDynamicsScale": tempo_dynamics_scale,
                    "volumeScale": volume_scale,
                }
            )
            synthesis = await self._request(
                client,
                "POST",
                "/synthesis",
                params={"speaker": style_id},
                json=query,
            )
        content = synthesis.content
        if not content or len(content) > self.settings.max_audio_upload_bytes:
            raise _invalid_response()
        return content

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self.settings.aivis_base_url.rstrip("/"),
            timeout=self.settings.aivis_request_timeout_seconds,
            transport=self._transport,
        )

    @staticmethod
    async def _request(
        client: httpx.AsyncClient,
        method: str,
        path: str,
        *,
        params: dict[str, str | int] | None = None,
        json: dict[str, object] | None = None,
    ) -> httpx.Response:
        try:
            response = await client.request(method, path, params=params, json=json)
            response.raise_for_status()
            return response
        except httpx.RequestError as error:
            raise _unavailable() from error
        except httpx.HTTPStatusError as error:
            raise ApplicationError(
                "AIVIS_REQUEST_FAILED", "errors.speechGenerationFailed", 502
            ) from error


def _unavailable() -> ApplicationError:
    return ApplicationError("AIVIS_UNAVAILABLE", "errors.aivisUnavailable", 503)


def _invalid_response() -> ApplicationError:
    return ApplicationError("AIVIS_INVALID_RESPONSE", "errors.speechGenerationFailed", 502)


def _start_process(command: list[str], creation_flags: int) -> subprocess.Popen[bytes]:
    return subprocess.Popen(  # noqa: S603 - trusted operator path and fixed args.
        command,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        shell=False,
        creationflags=creation_flags,
    )


def _terminate_process(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is None:
        process.terminate()
