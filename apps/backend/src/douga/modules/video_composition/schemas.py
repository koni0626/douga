from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class CompositionModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class NarrationVoice(CompositionModel):
    style_id: int = Field(ge=-(2**31), le=2**31 - 1)
    speed_scale: float = Field(default=1.0, ge=0.5, le=2.0)
    intonation_scale: float = Field(default=1.0, ge=0.0, le=2.0)
    tempo_dynamics_scale: float = Field(default=1.0, ge=0.0, le=2.0)
    volume_scale: float = Field(default=1.0, ge=0.0, le=2.0)


class PronunciationEntry(CompositionModel):
    surface: str = Field(min_length=1, max_length=200)
    reading: str = Field(min_length=1, max_length=500)
    locale: Literal["ja", "en"] | None = None


class NarrationCueInput(CompositionModel):
    id: str = Field(min_length=1, max_length=100)
    display_text: str = Field(min_length=1, max_length=10_000)
    speech_text: str | None = Field(default=None, min_length=1, max_length=10_000)


class NarratedSectionInput(CompositionModel):
    id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    image_asset_id: UUID | None = None
    animation: Literal["none", "slow_zoom_in", "slow_zoom_out"] = "slow_zoom_in"
    cues: list[NarrationCueInput] = Field(min_length=1, max_length=500)


class CaptionStyleInput(CompositionModel):
    preset: Literal["bottom_box"] = "bottom_box"


class NarratedVideoInput(CompositionModel):
    replace_scope: Literal["empty_only", "generated_draft", "entire_timeline"] = (
        "generated_draft"
    )
    voice: NarrationVoice
    sections: list[NarratedSectionInput] = Field(min_length=1, max_length=100)
    caption_style: CaptionStyleInput = Field(default_factory=CaptionStyleInput)
    pronunciation_entries: list[PronunciationEntry] = Field(default_factory=list, max_length=500)

    @model_validator(mode="after")
    def validate_identifiers_and_cue_count(self) -> NarratedVideoInput:
        section_ids = [section.id for section in self.sections]
        cue_ids = [cue.id for section in self.sections for cue in section.cues]
        if len(section_ids) != len(set(section_ids)) or len(cue_ids) != len(set(cue_ids)):
            raise ValueError("section and cue IDs must be unique")
        if len(cue_ids) > 500:
            raise ValueError("video may contain at most 500 cues")
        return self


class RebuildNarrationInput(CompositionModel):
    voice: NarrationVoice
    sections: list[NarratedSectionInput] | None = Field(default=None, max_length=100)
    pronunciation_entries: list[PronunciationEntry] = Field(default_factory=list, max_length=500)
    ripple_visuals: bool = True

    @model_validator(mode="after")
    def validate_optional_sections(self) -> RebuildNarrationInput:
        if self.sections is None:
            return self
        NarratedVideoInput(
            voice=self.voice,
            sections=self.sections,
            pronunciation_entries=self.pronunciation_entries,
        )
        return self
