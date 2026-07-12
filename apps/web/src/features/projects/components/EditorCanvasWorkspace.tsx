import { type DragEvent, useRef } from "react";
import { useTranslation } from "react-i18next";

import type { ProjectDocument } from "@douga/project-schema";
import { resolveCameraTransform, SceneRenderer } from "@douga/scene-renderer";

import { assetContentUrl } from "../../../shared/lib/api";
import type { EditorTool, Layer, Scene } from "../lib/editorTypes";
import type { LayerAnimationPreset } from "../lib/layerKeyframes";
import {
  CanvasObjectEditor,
  type LayerTransformPatch,
} from "./CanvasObjectEditor";
import { AudioPreview } from "./EditorFields";

interface EditorCanvasWorkspaceProps {
  applyAnimationPreset: (
    layerId: string,
    preset: LayerAnimationPreset,
    durationMs: number,
  ) => void;
  captionDraft: string;
  clearAnimation: (layerId: string) => void;
  commitInlineCaption: () => void;
  dropActive: boolean;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  playing: boolean;
  previewProject: ProjectDocument;
  previewScene?: Scene;
  project: ProjectDocument;
  scene?: Scene;
  selectedLayerId?: string;
  setActiveTool: (tool: EditorTool) => void;
  setCaptionDraft: (value: string) => void;
  setCaptionEditing: (editing: boolean) => void;
  setDropActive: (active: boolean) => void;
  setLayerPreview: (
    preview: { layerId: string; patch: LayerTransformPatch } | undefined,
  ) => void;
  setSelectedLayerId: (layerId: string) => void;
  timeMs: number;
  updateLayer: (layerId: string, patch: Partial<Layer>) => void;
  uploadErrorKey?: string;
  uploadingImage: boolean;
}

export function EditorCanvasWorkspace({
  applyAnimationPreset,
  captionDraft,
  clearAnimation,
  commitInlineCaption,
  dropActive,
  onDrop,
  playing,
  previewProject,
  previewScene,
  project,
  scene,
  selectedLayerId,
  setActiveTool,
  setCaptionDraft,
  setCaptionEditing,
  setDropActive,
  setLayerPreview,
  setSelectedLayerId,
  timeMs,
  updateLayer,
  uploadErrorKey,
  uploadingImage,
}: EditorCanvasWorkspaceProps) {
  const { t } = useTranslation();
  const captionInputRef = useRef<HTMLTextAreaElement>(null);

  return (
    <section className="editor-center">
      <div
        className={`editor-preview${dropActive ? " editor-preview--drop-active" : ""}`}
        aria-label={scene ? t("editor.imageDropZone") : undefined}
        onDragEnter={(event) => {
          event.preventDefault();
          if (scene && !uploadingImage) setDropActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDropActive(false);
        }}
        onDrop={onDrop}
      >
        {scene ? (
          <div
            className="canvas-stage"
            style={{
              aspectRatio: `${project.video.width} / ${project.video.height}`,
              width: `min(100%, calc((100vh - 19rem) * ${project.video.width / project.video.height}))`,
            }}
          >
            <SceneRenderer
              project={previewProject}
              sceneIndex={0}
              timeMs={timeMs}
              assetUrl={assetContentUrl}
              hideCaption={!playing}
            />
            {!playing ? (
              <CanvasObjectEditor
                animationLabels={{
                  animation: t("editor.animation.title"),
                  back: t("editor.animation.back"),
                  duration: t("editor.animation.duration"),
                  effect: t("editor.animation.effect"),
                  remove: t("editor.animation.remove"),
                  presets: {
                    slide_left: t("editor.animation.presets.slideLeft"),
                    slide_right: t("editor.animation.presets.slideRight"),
                    slide_up: t("editor.animation.presets.slideUp"),
                    slide_down: t("editor.animation.presets.slideDown"),
                    zoom_in: t("editor.animation.presets.zoomIn"),
                    pop: t("editor.animation.presets.pop"),
                    bounce: t("editor.animation.presets.bounce"),
                    shake: t("editor.animation.presets.shake"),
                    spin: t("editor.animation.presets.spin"),
                    pulse: t("editor.animation.presets.pulse"),
                    float: t("editor.animation.presets.float"),
                    fade_in: t("editor.animation.presets.fadeIn"),
                    fade_out: t("editor.animation.presets.fadeOut"),
                    blink: t("editor.animation.presets.blink"),
                    flash: t("editor.animation.presets.flash"),
                  },
                }}
                cameraTransform={resolveCameraTransform(
                  project.camera_effects ?? [],
                  timeMs,
                )}
                fillCanvasLabel={t("editor.fillCanvas")}
                flipHorizontalLabel={t("editor.flipHorizontal")}
                flipVerticalLabel={t("editor.flipVertical")}
                height={project.video.height}
                layers={previewScene?.layers ?? []}
                lockLabel={t("editor.lock")}
                lockedLabel={t("editor.locked")}
                onApplyAnimation={applyAnimationPreset}
                onClearAnimation={clearAnimation}
                onCommit={updateLayer}
                onPreview={(layerId, patch) =>
                  setLayerPreview(patch ? { layerId, patch } : undefined)
                }
                onSelect={setSelectedLayerId}
                selectedLayerId={selectedLayerId}
                unlockLabel={t("editor.unlock")}
                width={project.video.width}
              />
            ) : null}
            {!playing ? (
              <svg
                className="inline-caption-overlay"
                viewBox={`0 0 ${project.video.width} ${project.video.height}`}
                aria-label={t("editor.inlineCaptionArea")}
              >
                <foreignObject
                  x={project.caption_style.x}
                  y={project.caption_style.y}
                  width={project.caption_style.width}
                  height={project.caption_style.height}
                >
                  <textarea
                    ref={captionInputRef}
                    className="inline-caption-input"
                    aria-label={t("editor.inlineCaptionInput")}
                    value={captionDraft}
                    placeholder={t("editor.inlineCaptionPlaceholder")}
                    onBlur={commitInlineCaption}
                    onChange={(event) => setCaptionDraft(event.target.value)}
                    onFocus={() => setCaptionEditing(true)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setActiveTool("dialogues");
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        (event.ctrlKey || event.metaKey)
                      ) {
                        event.preventDefault();
                        commitInlineCaption();
                        event.currentTarget.blur();
                      }
                    }}
                    style={captionStyle(project)}
                  />
                </foreignObject>
              </svg>
            ) : null}
          </div>
        ) : (
          <p>{t("editor.noScenes")}</p>
        )}
        {scene && (dropActive || uploadingImage) ? (
          <div className="image-drop-overlay" role="status">
            {t(
              uploadingImage ? "editor.imageUploading" : "editor.imageDropHere",
            )}
          </div>
        ) : null}
      </div>
      {uploadErrorKey ? (
        <p className="form-error" role="alert">
          {t(uploadErrorKey)}
        </p>
      ) : null}
      {scene ? (
        <AudioPreview
          tracks={project.audio_tracks ?? []}
          playing={playing}
          timeMs={timeMs}
        />
      ) : null}
    </section>
  );
}

function captionStyle(project: ProjectDocument) {
  const style = project.caption_style;
  return {
    background: colorWithOpacity(
      style.background_color,
      style.background_opacity,
    ),
    borderRadius: style.border_radius,
    color: style.text_color,
    fontFamily: style.font_family,
    fontSize: style.font_size,
    fontWeight: style.font_weight ?? 600,
    lineHeight: style.line_height,
    padding: style.padding,
    textAlign: style.text_align,
  } as const;
}

function colorWithOpacity(color: string, opacity: number): string {
  return /^#[0-9a-f]{6}$/iu.test(color)
    ? `${color}${Math.round(Math.max(0, Math.min(1, opacity)) * 255)
        .toString(16)
        .padStart(2, "0")}`
    : color;
}
