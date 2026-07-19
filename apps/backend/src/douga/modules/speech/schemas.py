from pydantic import BaseModel, Field

from douga.modules.assets.schemas import AssetResponse


class SpeechVoiceStyleResponse(BaseModel):
    id: int
    name: str


class SpeechVoiceResponse(BaseModel):
    speaker_uuid: str
    name: str
    styles: list[SpeechVoiceStyleResponse]


class SpeechVoiceListResponse(BaseModel):
    items: list[SpeechVoiceResponse]


class SpeechSynthesisRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5_000)
    style_id: int = Field(ge=-(2**31), le=2**31 - 1)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    speed_scale: float = Field(default=1.0, ge=0.5, le=2.0)
    intonation_scale: float = Field(default=1.0, ge=0.0, le=2.0)
    tempo_dynamics_scale: float = Field(default=1.0, ge=0.0, le=2.0)
    volume_scale: float = Field(default=1.0, ge=0.0, le=2.0)


class SpeechSynthesisResponse(BaseModel):
    asset: AssetResponse
