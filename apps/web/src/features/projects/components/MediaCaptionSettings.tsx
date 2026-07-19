import { useTranslation } from "react-i18next";

import type { ProjectDocument } from "@douga/project-schema";

import type {
  AssetDto,
  SpeechSynthesisSettingsDto,
} from "../../../shared/lib/api";
import type {
  AudioTrack,
  CameraEffect,
  CameraPreset,
  EditorTool,
} from "../lib/editorTypes";
import { AudioTrackSettings } from "./AudioTrackSettings";
import { AivisSpeechPanel } from "./AivisSpeechPanel";
import { CaptionStyleSettings } from "./CaptionStyleSettings";
import { NumberField } from "./EditorFields";

export interface MediaCaptionSettingsProps {
  activeTool: EditorTool;
  audioAssets: AssetDto[];
  captionStyle: ProjectDocument["caption_style"];
  cameraEffects: CameraEffect[];
  durationMs: number;
  onGeneratedSpeech: (
    asset: AssetDto,
    settings: SpeechSynthesisSettingsDto,
  ) => void;
  onAddCamera: (preset: CameraPreset) => void;
  onDeleteAudio: (trackId: string) => void;
  onDeleteCamera: (effectId: string) => void;
  onUpdateAudio: (trackId: string, patch: Partial<AudioTrack>) => void;
  onUpdateCamera: (effectId: string, patch: Partial<CameraEffect>) => void;
  onUpdateCaption: (patch: Partial<ProjectDocument["caption_style"]>) => void;
  audioTracks: AudioTrack[];
  selectedAudioTrackId?: string;
}

export function MediaCaptionSettings({
  activeTool,
  audioAssets,
  audioTracks,
  cameraEffects,
  captionStyle,
  durationMs,
  onGeneratedSpeech,
  onAddCamera,
  onDeleteAudio,
  onDeleteCamera,
  onUpdateAudio,
  onUpdateCamera,
  onUpdateCaption,
  selectedAudioTrackId,
}: MediaCaptionSettingsProps) {
  const { t } = useTranslation();
  const selectedAudioTrack = audioTracks.find(
    (track) => track.id === selectedAudioTrackId,
  );
  const selectedAudioAsset = audioAssets.find(
    (asset) => asset.id === selectedAudioTrack?.asset_id,
  );
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
        {selectedAudioTrack ? null : (
          <AivisSpeechPanel onGenerated={onGeneratedSpeech} />
        )}
        {selectedAudioTrack &&
        (selectedAudioAsset?.source === "generated" ||
          selectedAudioTrack.speech_synthesis) ? (
          <AivisSpeechPanel
            key={selectedAudioTrack.id}
            initialSettings={selectedAudioTrack.speech_synthesis}
            initialText={selectedAudioAsset?.name}
            onGenerated={onGeneratedSpeech}
            submitLabel={t("editor.speech.regenerate")}
          />
        ) : null}
        {selectedAudioTrack ? (
          <AudioTrackSettings
            fallbackDurationMs={durationMs}
            onDelete={() => onDeleteAudio(selectedAudioTrack.id)}
            onUpdate={(patch) => onUpdateAudio(selectedAudioTrack.id, patch)}
            sourceDurationMs={selectedAudioAsset?.duration_ms ?? undefined}
            track={selectedAudioTrack}
          />
        ) : null}
      </details>

      <details open hidden={activeTool !== "caption"}>
        <summary>{t("editor.captionStyle")}</summary>
        <CaptionStyleSettings
          captionStyle={captionStyle}
          onUpdate={onUpdateCaption}
        />
      </details>
    </>
  );
}
