import io
import re
import wave
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from douga.core.config import get_settings
from douga.core.errors import ApplicationError
from douga.integrations.aivis_speech import AivisSpeechClient, AivisVoice
from douga.modules.assets.service import AssetService, AssetView
from douga.modules.speech.schemas import SpeechSynthesisRequest


@dataclass(frozen=True, slots=True)
class SpeechCue:
    text: str
    start_ms: int
    end_ms: int


@dataclass(frozen=True, slots=True)
class SyncedSpeechResult:
    asset: AssetView
    cues: tuple[SpeechCue, ...]


def split_caption_text(text: str, max_chars: int) -> tuple[str, ...]:
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return ()
    sentences = re.findall(r".+?(?:[。！？!?]+|$)", normalized)
    result: list[str] = []
    for sentence in sentences:
        remaining = sentence.strip()
        while len(remaining) > max_chars:
            window = remaining[: max_chars + 1]
            candidates = [
                index + 1
                for index, character in enumerate(window[:max_chars])
                if character in "、，,；;：: "
            ]
            preferred = [index for index in candidates if index >= max_chars // 2]
            cut = preferred[-1] if preferred else candidates[-1] if candidates else max_chars
            chunk = remaining[:cut].strip()
            if chunk:
                result.append(chunk)
            remaining = remaining[cut:].strip()
        if remaining:
            result.append(remaining)
    return tuple(result)


def concatenate_wav_segments(
    segments: tuple[tuple[str, bytes], ...],
) -> tuple[bytes, tuple[SpeechCue, ...]]:
    if not segments:
        raise ApplicationError("SPEECH_TEXT_INVALID", "errors.speechTextInvalid", 422)
    format_key: tuple[int, int, int, str] | None = None
    audio_frames: list[bytes] = []
    cues: list[SpeechCue] = []
    total_frames = 0
    frame_rate = 0
    try:
        for text, content in segments:
            with wave.open(io.BytesIO(content), "rb") as reader:
                current_format = (
                    reader.getnchannels(),
                    reader.getsampwidth(),
                    reader.getframerate(),
                    reader.getcomptype(),
                )
                if format_key is None:
                    format_key = current_format
                    frame_rate = reader.getframerate()
                elif current_format != format_key:
                    raise ApplicationError(
                        "AIVIS_INVALID_RESPONSE", "errors.speechGenerationFailed", 502
                    )
                start_ms = round(total_frames * 1000 / frame_rate)
                frame_count = reader.getnframes()
                audio_frames.append(reader.readframes(frame_count))
                total_frames += frame_count
                end_ms = round(total_frames * 1000 / frame_rate)
                cues.append(SpeechCue(text=text, start_ms=start_ms, end_ms=end_ms))
    except (EOFError, wave.Error) as error:
        raise ApplicationError(
            "AIVIS_INVALID_RESPONSE", "errors.speechGenerationFailed", 502
        ) from error

    if format_key is None:
        raise ApplicationError("AIVIS_INVALID_RESPONSE", "errors.speechGenerationFailed", 502)
    output = io.BytesIO()
    with wave.open(output, "wb") as writer:
        writer.setnchannels(format_key[0])
        writer.setsampwidth(format_key[1])
        writer.setframerate(format_key[2])
        writer.setcomptype(format_key[3], "not compressed")
        for frames in audio_frames:
            writer.writeframesraw(frames)
    return output.getvalue(), tuple(cues)


class SpeechService:
    def __init__(
        self,
        session: AsyncSession,
        *,
        client: AivisSpeechClient | None = None,
        asset_service: AssetService | None = None,
    ) -> None:
        self.client = client or AivisSpeechClient()
        self.asset_service = asset_service or AssetService(session)

    async def list_voices(self) -> tuple[AivisVoice, ...]:
        return await self.client.list_voices()

    async def synthesize(self, user_id: UUID, request: SpeechSynthesisRequest) -> AssetView:
        text = request.text.strip()
        if not text or len(text) > get_settings().aivis_max_text_length:
            raise ApplicationError("SPEECH_TEXT_INVALID", "errors.speechTextInvalid", 422)
        content = await self.client.synthesize(
            text=text,
            style_id=request.style_id,
            speed_scale=request.speed_scale,
            intonation_scale=request.intonation_scale,
            tempo_dynamics_scale=request.tempo_dynamics_scale,
            volume_scale=request.volume_scale,
        )
        name = request.name.strip() if request.name else text[:40]
        return await self.asset_service.create_generated_audio(
            user_id,
            name=name,
            content=content,
            metadata={
                "provider": "aivis_speech",
                "text": text,
                "style_id": request.style_id,
                "speed_scale": request.speed_scale,
                "intonation_scale": request.intonation_scale,
                "tempo_dynamics_scale": request.tempo_dynamics_scale,
                "volume_scale": request.volume_scale,
            },
        )

    async def synthesize_synced(
        self,
        user_id: UUID,
        request: SpeechSynthesisRequest,
        *,
        max_chars_per_caption: int,
    ) -> SyncedSpeechResult:
        text = request.text.strip()
        if not text or len(text) > get_settings().aivis_max_text_length:
            raise ApplicationError("SPEECH_TEXT_INVALID", "errors.speechTextInvalid", 422)
        caption_texts = split_caption_text(text, max_chars_per_caption)
        generated: list[tuple[str, bytes]] = []
        for caption_text in caption_texts:
            generated.append(
                (
                    caption_text,
                    await self.client.synthesize(
                        text=caption_text,
                        style_id=request.style_id,
                        speed_scale=request.speed_scale,
                        intonation_scale=request.intonation_scale,
                        tempo_dynamics_scale=request.tempo_dynamics_scale,
                        volume_scale=request.volume_scale,
                    ),
                )
            )
        content, cues = concatenate_wav_segments(tuple(generated))
        name = request.name.strip() if request.name else text[:40]
        asset = await self.asset_service.create_generated_audio(
            user_id,
            name=name,
            content=content,
            metadata={
                "provider": "aivis_speech",
                "text": text,
                "style_id": request.style_id,
                "speed_scale": request.speed_scale,
                "intonation_scale": request.intonation_scale,
                "tempo_dynamics_scale": request.tempo_dynamics_scale,
                "volume_scale": request.volume_scale,
                "alignment_method": "segmented_synthesis_v1",
                "caption_cues": [
                    {"text": cue.text, "start_ms": cue.start_ms, "end_ms": cue.end_ms}
                    for cue in cues
                ],
            },
        )
        return SyncedSpeechResult(asset=asset, cues=cues)
