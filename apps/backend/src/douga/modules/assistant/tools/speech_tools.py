from typing import Any

from pydantic import Field

from douga.modules.assistant.tools.project_tool_service import (
    StrictToolArgs,
    empty_parameters,
    model_parameters,
)
from douga.modules.assistant.tools.registry import (
    ToolContext,
    ToolDefinition,
    ToolExecutionResult,
)
from douga.modules.speech.schemas import SpeechSynthesisRequest
from douga.modules.speech.service import SpeechService


class GenerateNarrationArgs(StrictToolArgs):
    text: str = Field(min_length=1, max_length=5_000)
    style_id: int = Field(ge=-(2**31), le=2**31 - 1)
    name: str | None = Field(min_length=1, max_length=255)
    speed_scale: float = Field(ge=0.5, le=2.0)
    intonation_scale: float = Field(ge=0.0, le=2.0)
    tempo_dynamics_scale: float = Field(ge=0.0, le=2.0)
    volume_scale: float = Field(ge=0.0, le=2.0)


async def list_speech_voices(
    context: ToolContext, arguments: dict[str, Any]
) -> ToolExecutionResult:
    del arguments
    voices = await SpeechService(context.session).list_voices()
    return ToolExecutionResult(
        data={
            "voices": [
                {
                    "speaker_uuid": voice.speaker_uuid,
                    "name": voice.name,
                    "styles": [{"id": style.id, "name": style.name} for style in voice.styles],
                }
                for voice in voices
            ]
        }
    )


async def generate_narration(
    context: ToolContext, arguments: dict[str, Any]
) -> ToolExecutionResult:
    values = GenerateNarrationArgs.model_validate(arguments)
    request = SpeechSynthesisRequest.model_validate(values.model_dump())
    asset = await SpeechService(context.session).synthesize(context.user_id, request)
    synthesis = values.model_dump(mode="json")
    return ToolExecutionResult(
        data={
            "asset": {
                "id": str(asset.id),
                "name": asset.name,
                "kind": asset.kind,
                "status": asset.status,
                "mime_type": asset.mime_type,
                "duration_ms": asset.duration_ms,
            },
            "speech_synthesis": synthesis,
        },
        artifact={
            "type": "audio",
            "asset_id": str(asset.id),
            "name": asset.name,
            "duration_ms": asset.duration_ms,
        },
    )


def speech_tool_definitions() -> tuple[ToolDefinition, ...]:
    return (
        ToolDefinition(
            name="list_speech_voices",
            description=(
                "List AivisSpeech speakers and style IDs available for narration generation."
            ),
            parameters=empty_parameters(),
            handler=list_speech_voices,
        ),
        ToolDefinition(
            name="generate_narration",
            description=(
                "Generate narration with AivisSpeech and register it as a user-owned audio asset. "
                "Use the exact returned duration and asset ID with add_audio_clip to place it."
            ),
            parameters=model_parameters(GenerateNarrationArgs),
            handler=generate_narration,
        ),
    )
