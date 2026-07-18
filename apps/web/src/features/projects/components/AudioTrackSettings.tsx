import { useTranslation } from "react-i18next";

import type { AudioTrack } from "../lib/editorTypes";
import { clampAudioTrimRange } from "../lib/audioTrim";
import { NumberField } from "./EditorFields";

interface AudioTrackSettingsProps {
  fallbackDurationMs: number;
  onDelete: () => void;
  onUpdate: (patch: Partial<AudioTrack>) => void;
  sourceDurationMs?: number;
  track: AudioTrack;
}

export function AudioTrackSettings({
  fallbackDurationMs,
  onDelete,
  onUpdate,
  sourceDurationMs,
  track,
}: AudioTrackSettingsProps) {
  const { t } = useTranslation();
  const currentDurationMs =
    track.duration_ms ??
    Math.max(
      50,
      (sourceDurationMs ?? fallbackDurationMs) - track.trim_start_ms,
    );

  function updateTrim(
    requestedTrimStartMs: number,
    requestedDurationMs: number,
  ) {
    const range = clampAudioTrimRange(
      sourceDurationMs,
      requestedTrimStartMs,
      requestedDurationMs,
    );
    onUpdate({
      trim_start_ms: range.trimStartMs,
      duration_ms: range.durationMs,
      fade_in_ms: Math.min(track.fade_in_ms, range.durationMs),
      fade_out_ms: Math.min(track.fade_out_ms, range.durationMs),
    });
  }

  return (
    <div className="audio-track">
      <label>
        <span>{t("editor.audioRole")}</span>
        <select
          value={track.role}
          onChange={(event) =>
            onUpdate({ role: event.target.value as AudioTrack["role"] })
          }
        >
          <option value="narration">Narration</option>
          <option value="bgm">BGM</option>
          <option value="effect">Effect</option>
        </select>
      </label>
      <div className="property-grid">
        <NumberField
          label={t("editor.audioStartSeconds")}
          value={track.start_ms / 1000}
          min={0}
          step={0.1}
          onChange={(value) =>
            onUpdate({ start_ms: Math.max(0, Math.round(value * 1000)) })
          }
        />
        <NumberField
          label={t("editor.audioTrimStartSeconds")}
          value={track.trim_start_ms / 1000}
          min={0}
          max={
            sourceDurationMs === undefined
              ? undefined
              : Math.max(0, sourceDurationMs / 1000 - 0.05)
          }
          step={0.1}
          onChange={(value) =>
            updateTrim(Math.max(0, value * 1000), currentDurationMs)
          }
        />
        <NumberField
          label={t("editor.audioDurationSeconds")}
          value={currentDurationMs / 1000}
          min={0.05}
          max={
            sourceDurationMs === undefined
              ? undefined
              : Math.max(0.05, (sourceDurationMs - track.trim_start_ms) / 1000)
          }
          step={0.1}
          onChange={(value) =>
            updateTrim(track.trim_start_ms, Math.max(50, value * 1000))
          }
        />
        <NumberField
          label={t("editor.fadeInSeconds")}
          value={track.fade_in_ms / 1000}
          min={0}
          max={currentDurationMs / 1000}
          step={0.1}
          onChange={(value) =>
            onUpdate({
              fade_in_ms: Math.min(
                currentDurationMs,
                Math.max(0, Math.round(value * 1000)),
              ),
            })
          }
        />
        <NumberField
          label={t("editor.fadeOutSeconds")}
          value={track.fade_out_ms / 1000}
          min={0}
          max={currentDurationMs / 1000}
          step={0.1}
          onChange={(value) =>
            onUpdate({
              fade_out_ms: Math.min(
                currentDurationMs,
                Math.max(0, Math.round(value * 1000)),
              ),
            })
          }
        />
      </div>
      <NumberField
        label={t("editor.volume")}
        value={track.volume}
        min={0}
        max={2}
        step={0.05}
        onChange={(value) => onUpdate({ volume: value })}
      />
      <button type="button" className="danger" onClick={onDelete}>
        {t("editor.delete")}
      </button>
    </div>
  );
}
