import { useTranslation } from "react-i18next";

import type { ProjectDocument } from "@douga/project-schema";

import type { AssetDto } from "../../../shared/lib/api";
import type {
  AudioTrack,
  CameraEffect,
  CameraPreset,
  EditorTool,
} from "../lib/editorTypes";
import { AudioTrackSettings } from "./AudioTrackSettings";
import { NumberField } from "./EditorFields";

export interface MediaCaptionSettingsProps {
  activeTool: EditorTool;
  audioAssets: AssetDto[];
  captionStyle: ProjectDocument["caption_style"];
  cameraEffects: CameraEffect[];
  durationMs: number;
  onAddAudio: (asset: AssetDto) => void;
  onAddCamera: (preset: CameraPreset) => void;
  onDeleteAudio: (trackId: string) => void;
  onDeleteCamera: (effectId: string) => void;
  onUpdateAudio: (trackId: string, patch: Partial<AudioTrack>) => void;
  onUpdateCamera: (effectId: string, patch: Partial<CameraEffect>) => void;
  onUpdateCaption: (patch: Partial<ProjectDocument["caption_style"]>) => void;
  audioTracks: AudioTrack[];
}

export function MediaCaptionSettings({
  activeTool,
  audioAssets,
  audioTracks,
  cameraEffects,
  captionStyle,
  durationMs,
  onAddAudio,
  onAddCamera,
  onDeleteAudio,
  onDeleteCamera,
  onUpdateAudio,
  onUpdateCamera,
  onUpdateCaption,
}: MediaCaptionSettingsProps) {
  const { t } = useTranslation();
  return (
    <>
      <details open hidden={activeTool !== "camera"}>
        <summary>{t("editor.camera")}</summary>
        <div className="camera-preset-grid">
          {(
            [
              "handheld",
              "walk",
              "breathe",
              "float",
              "sway",
              "slow_rotate",
              "zoom_pulse",
              "heartbeat",
            ] as CameraPreset[]
          ).map((preset) => (
            <button
              type="button"
              key={preset}
              onClick={() => onAddCamera(preset)}
            >
              {t(`editor.cameraPreset.${preset}`)}
            </button>
          ))}
        </div>
        {cameraEffects.map((effect) => (
          <div className="camera-effect-editor" key={effect.id}>
            <strong>{t(`editor.cameraPreset.${effect.preset}`)}</strong>
            <div className="property-grid">
              <NumberField
                label={t("editor.startSeconds")}
                value={effect.start_ms / 1000}
                min={0}
                step={0.1}
                onChange={(value) =>
                  onUpdateCamera(effect.id, {
                    start_ms: Math.max(0, Math.round(value * 1000)),
                  })
                }
              />
              <NumberField
                label={t("editor.endSeconds")}
                value={effect.end_ms / 1000}
                min={0.1}
                step={0.1}
                onChange={(value) =>
                  onUpdateCamera(effect.id, {
                    end_ms: Math.max(1, Math.round(value * 1000)),
                  })
                }
              />
              <NumberField
                label={t("editor.intensity")}
                value={effect.intensity}
                min={0.1}
                max={3}
                step={0.1}
                onChange={(value) =>
                  onUpdateCamera(effect.id, { intensity: value })
                }
              />
              <NumberField
                label={t("editor.periodSeconds")}
                value={effect.period_ms / 1000}
                min={0.1}
                step={0.1}
                onChange={(value) =>
                  onUpdateCamera(effect.id, {
                    period_ms: Math.max(100, Math.round(value * 1000)),
                  })
                }
              />
            </div>
            <button
              type="button"
              className="danger"
              onClick={() => onDeleteCamera(effect.id)}
            >
              {t("editor.delete")}
            </button>
          </div>
        ))}
      </details>

      <details open hidden={activeTool !== "audio"}>
        <summary>{t("editor.audio")}</summary>
        <div className="audio-picker">
          {audioAssets.map((asset) => (
            <button
              type="button"
              key={asset.id}
              onClick={() => onAddAudio(asset)}
            >
              {asset.name}
            </button>
          ))}
        </div>
        {audioTracks.map((track) => (
          <AudioTrackSettings
            fallbackDurationMs={durationMs}
            key={track.id}
            onDelete={() => onDeleteAudio(track.id)}
            onUpdate={(patch) => onUpdateAudio(track.id, patch)}
            sourceDurationMs={
              audioAssets.find((asset) => asset.id === track.asset_id)
                ?.duration_ms ?? undefined
            }
            track={track}
          />
        ))}
      </details>

      <details open hidden={activeTool !== "caption"}>
        <summary>{t("editor.captionStyle")}</summary>
        <div className="property-grid">
          {(["x", "y", "width", "height"] as const).map((key) => (
            <NumberField
              key={key}
              label={key}
              value={captionStyle[key]}
              min={key === "width" || key === "height" ? 1 : undefined}
              onChange={(value) => onUpdateCaption({ [key]: value })}
            />
          ))}
          <NumberField
            label={t("editor.fontSize")}
            value={captionStyle.font_size}
            min={8}
            onChange={(value) => onUpdateCaption({ font_size: value })}
          />
          <NumberField
            label={t("editor.maxLines")}
            value={captionStyle.max_lines}
            min={1}
            max={20}
            onChange={(value) => onUpdateCaption({ max_lines: value })}
          />
          <label>
            <span>{t("editor.textColor")}</span>
            <input
              type="color"
              value={captionStyle.text_color}
              onChange={(event) =>
                onUpdateCaption({ text_color: event.target.value })
              }
            />
          </label>
        </div>
      </details>
    </>
  );
}
