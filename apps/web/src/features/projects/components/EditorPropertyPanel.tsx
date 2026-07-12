import { useTranslation } from "react-i18next";

import type { ProjectDocument } from "@douga/project-schema";

import type { AssetDto } from "../../../shared/lib/api";
import type {
  AudioTrack,
  CameraEffect,
  CameraPreset,
  Dialogue,
  EditorTool,
  Layer,
  Scene,
} from "../lib/editorTypes";
import { DialogueLayerSettings } from "./DialogueLayerSettings";
import { MediaCaptionSettings } from "./MediaCaptionSettings";

export interface EditorPropertyPanelProps {
  activeTool: EditorTool;
  audioAssets: AssetDto[];
  durationMs: number;
  imageAssets: AssetDto[];
  onAddAudio: (asset: AssetDto) => void;
  onAddCamera: (preset: CameraPreset) => void;
  onAddDialogue: () => void;
  onAddImage: (asset: AssetDto) => void;
  onAddLayer: (layer: Layer) => void;
  onClose: () => void;
  onDeleteAudio: (trackId: string) => void;
  onDeleteCamera: (effectId: string) => void;
  onDeleteDialogue: (dialogueId: string) => void;
  onDeleteLayer: (layerId: string) => void;
  onSelectLayer: (layerId: string) => void;
  onUpdateAudio: (trackId: string, patch: Partial<AudioTrack>) => void;
  onUpdateCamera: (effectId: string, patch: Partial<CameraEffect>) => void;
  onUpdateCaption: (patch: Partial<ProjectDocument["caption_style"]>) => void;
  onUpdateDialogue: (dialogueId: string, patch: Partial<Dialogue>) => void;
  onUpdateLayer: (layerId: string, patch: Partial<Layer>) => void;
  project: ProjectDocument;
  scene: Scene;
  selectedLayer?: Layer;
  selectedLayerId?: string;
}

export function EditorPropertyPanel(props: EditorPropertyPanelProps) {
  const { t } = useTranslation();
  const { activeTool, project } = props;
  return (
    <aside
      className={
        activeTool === "caption"
          ? "property-panel property-panel--caption"
          : "property-panel"
      }
      aria-label={t(`editor.tool.${activeTool}`)}
    >
      <div className="floating-panel-header">
        <h2>{t(`editor.tool.${activeTool}`)}</h2>
        <button
          type="button"
          aria-label={t("editor.closeTools")}
          title={t("editor.closeTools")}
          onClick={props.onClose}
        >
          ×
        </button>
      </div>
      <DialogueLayerSettings {...props} />
      <MediaCaptionSettings
        activeTool={activeTool}
        audioAssets={props.audioAssets}
        audioTracks={project.audio_tracks ?? []}
        cameraEffects={project.camera_effects ?? []}
        captionStyle={project.caption_style}
        onAddAudio={props.onAddAudio}
        onAddCamera={props.onAddCamera}
        onDeleteAudio={props.onDeleteAudio}
        onDeleteCamera={props.onDeleteCamera}
        onUpdateAudio={props.onUpdateAudio}
        onUpdateCamera={props.onUpdateCamera}
        onUpdateCaption={props.onUpdateCaption}
      />
    </aside>
  );
}
