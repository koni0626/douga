import type { ComponentProps, DragEvent } from "react";
import { useTranslation } from "react-i18next";

import type { ProjectDocument } from "@douga/project-schema";

import type { AssetDto } from "../../../shared/lib/api";
import type { EditorTool, Scene } from "../lib/editorTypes";
import type { CaptionTimelineClip } from "../lib/captionTimeline";
import { ObjectTimeline } from "./ObjectTimeline";

type TimelineProps = ComponentProps<typeof ObjectTimeline>;
type TimelineActions = Pick<
  TimelineProps,
  | "onAddCaption"
  | "onAddShape"
  | "onAddTextHorizontal"
  | "onAddTextVertical"
  | "onAudioStartChange"
  | "onCaptionChange"
  | "onCaptionDelete"
  | "onCaptionTextChange"
  | "onChange"
  | "onDeleteKeyframe"
  | "onDeleteLayer"
  | "onDuplicateKeyframe"
  | "onExtend"
  | "onKeyframeEasingChange"
  | "onMergeTrack"
  | "onMoveToTrack"
  | "onPlay"
  | "onRename"
  | "onReorder"
  | "onSeek"
  | "onSelect"
  | "onSplitTrack"
  | "onStop"
>;

interface EditorTimelineAreaProps {
  actions: TimelineActions;
  assets: AssetDto[];
  audioDropActive: boolean;
  captions: CaptionTimelineClip[];
  durationMs: number;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  playing: boolean;
  project: ProjectDocument;
  scene?: Scene;
  selectedLayerId?: string;
  setActiveTool: (tool: EditorTool) => void;
  setAudioDropActive: (active: boolean) => void;
  timeMs: number;
  uploadingAudio: boolean;
}

export function EditorTimelineArea({
  actions,
  assets,
  audioDropActive,
  captions,
  durationMs,
  onDrop,
  playing,
  project,
  scene,
  selectedLayerId,
  setActiveTool,
  setAudioDropActive,
  timeMs,
  uploadingAudio,
}: EditorTimelineAreaProps) {
  const { t } = useTranslation();

  return (
    <section
      className="editor-timeline-area"
      onDragEnter={(event) => {
        event.preventDefault();
        if (!uploadingAudio) setAudioDropActive(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setAudioDropActive(false);
      }}
      onDrop={onDrop}
    >
      {scene ? (
        <ObjectTimeline
          {...actions}
          collapseLabel={t("editor.collapseTimeline")}
          durationMs={durationMs}
          extendLabel={t("editor.extendTimeline")}
          expandLabel={t("editor.expandTimeline")}
          labelFor={(layer) =>
            layer.name?.trim()
              ? layer.name
              : layer.type === "text" && layer.text.trim()
                ? layer.text
                : t(`editor.layerType.${layer.type}`)
          }
          layers={scene.layers}
          cameraEffects={project.camera_effects ?? []}
          cameraEffectLabel={(effect) =>
            t(`editor.cameraPreset.${effect.preset}`)
          }
          cameraLabel={t("editor.cameraTrack")}
          captions={captions}
          captionTrackLabel={t("editor.captionTrack")}
          captionTrackEmptyLabel={t("editor.captionTrackEmpty")}
          captionInputLabel={t("editor.dialogueText")}
          captionDeleteLabel={t("editor.deleteCaption")}
          formatCaptionDuration={(value) =>
            t("editor.captionClipDuration", {
              seconds: (value / 1000).toFixed(1),
            })
          }
          audioLabel={t("editor.audioTrack")}
          audioTracks={project.audio_tracks ?? []}
          audioTrackLabel={(track) =>
            assets.find((asset) => asset.id === track.asset_id)?.name ??
            t("editor.audioTrack")
          }
          mergeAboveLabel={t("editor.mergeTrackAbove")}
          mergeBelowLabel={t("editor.mergeTrackBelow")}
          keyframeLabels={{
            delete: t("editor.keyframe.delete"),
            duplicate: t("editor.keyframe.duplicate"),
            easing: t("editor.keyframe.easing"),
            easingOptions: {
              linear: t("editor.keyframe.easingOptions.linear"),
              ease_in: t("editor.keyframe.easingOptions.easeIn"),
              ease_out: t("editor.keyframe.easingOptions.easeOut"),
              ease_in_out: t("editor.keyframe.easingOptions.easeInOut"),
              bounce: t("editor.keyframe.easingOptions.bounce"),
              step: t("editor.keyframe.easingOptions.step"),
            },
            keyframe: t("editor.keyframe.label"),
          }}
          onAddCamera={() => setActiveTool("camera")}
          onOpenAudioSettings={() => setActiveTool("audio")}
          onOpenCameraSettings={() => setActiveTool("camera")}
          onOpenCaptionSettings={() => setActiveTool("caption")}
          onOpenLayerSettings={() => setActiveTool("layers")}
          playLabel={t("play")}
          playing={playing}
          renameLabel={t("editor.renameObject")}
          resizeLabel={t("editor.resizeTimeline")}
          seekLabel={t("editor.timeline")}
          selectedLayerId={selectedLayerId}
          stopLabel={t("stop")}
          splitTrackLabel={t("editor.splitTrack")}
          timeMs={timeMs}
          title={t("editor.objectTimeline")}
          addCameraLabel={t("editor.timelineMenu.addCamera")}
          addCaptionLabel={t("editor.timelineMenu.addCaption")}
          addTextHorizontalLabel={t("editor.timelineMenu.addTextHorizontal")}
          addTextVerticalLabel={t("editor.timelineMenu.addTextVertical")}
          addShapeLabel={t("editor.timelineMenu.addShape")}
          addImageLabel={t("editor.timelineMenu.addImage")}
          addAudioLabel={t("editor.timelineMenu.addAudio")}
          settingsLabel={t("editor.timelineMenu.settings")}
          deleteLabel={t("editor.delete")}
          captionSettingsLabel={t("editor.timelineMenu.captionSettings")}
        />
      ) : null}
      {audioDropActive || uploadingAudio ? (
        <div className="timeline-audio-drop-overlay" role="status">
          {t(uploadingAudio ? "editor.audioUploading" : "editor.audioDropHere")}
        </div>
      ) : null}
    </section>
  );
}
