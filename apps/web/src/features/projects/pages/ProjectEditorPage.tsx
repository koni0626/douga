import { type DragEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";

import type { ProjectDocument } from "@douga/project-schema";
import {
  resolveCameraTransform,
  MIN_VIDEO_DURATION_MS,
  resolveLayerAtTime,
  resolveSceneDurationMs,
  roundVideoDurationMs,
  SceneRenderer,
  type LayerEasing,
  VIDEO_DURATION_STEP_MS,
} from "@douga/scene-renderer";

import {
  ApiError,
  apiRequest,
  apiUpload,
  assetContentUrl,
  type AssetDto,
  type AssetListDto,
  type ProjectDetailDto,
  type UploadTargetDto,
} from "../../../shared/lib/api";
import { AudioPreview, NumberField } from "../components/EditorFields";
import {
  CanvasObjectEditor,
  type LayerTransformPatch,
} from "../components/CanvasObjectEditor";
import {
  FloatingEditorTools,
  type EditorTool,
} from "../components/FloatingEditorTools";
import { ObjectTimeline } from "../components/ObjectTimeline";
import {
  applyLayerAnimationPreset,
  applyLayerPatchAtTime,
  changeLayerKeyframeEasing,
  clearLayerAnimation,
  deleteLayerKeyframe,
  duplicateLayerKeyframe,
  type LayerAnimationPreset,
  snapKeyframeTime,
} from "../lib/layerKeyframes";

type Scene = ProjectDocument["scenes"][number];
type Layer = Scene["layers"][number];
type Dialogue = Scene["dialogues"][number];
type AudioTrack = NonNullable<ProjectDocument["audio_tracks"]>[number];
type CameraEffect = NonNullable<ProjectDocument["camera_effects"]>[number];
type CameraPreset = CameraEffect["preset"];
type SaveState = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";
type LayerPreview = { layerId: string; patch: LayerTransformPatch };

function fitImageToCanvas(asset: AssetDto, video: ProjectDocument["video"]) {
  const sourceWidth = asset.width ?? 16;
  const sourceHeight = asset.height ?? 9;
  const scale = Math.min(
    video.width / sourceWidth,
    video.height / sourceHeight,
  );
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);
  return {
    x: Math.round((video.width - width) / 2),
    y: Math.round((video.height - height) / 2),
    width,
    height,
  };
}

function ensureCanvas(document: ProjectDocument): ProjectDocument {
  if (document.scenes.length > 0) return document;
  return {
    ...document,
    scenes: [
      {
        id: crypto.randomUUID(),
        name: "Canvas",
        background: { type: "color", color: "#16324f" },
        layers: [],
        dialogues: [],
      },
    ],
  };
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches("input, textarea, select"))
  );
}

function clipboardImageFile(event: ClipboardEvent): File | undefined {
  const file = Array.from(event.clipboardData?.items ?? [])
    .find((item) => item.kind === "file" && item.type.startsWith("image/"))
    ?.getAsFile();
  if (!file) return undefined;
  if (file.name && file.name !== "image") return file;
  const extension =
    file.type === "image/jpeg"
      ? "jpg"
      : file.type === "image/webp"
        ? "webp"
        : "png";
  return new File([file], `clipboard-${Date.now()}.${extension}`, {
    type: file.type,
  });
}

export function ProjectEditorPage() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const [detail, setDetail] = useState<ProjectDetailDto>();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const selectedSceneIndex = 0;
  const [selectedLayerId, setSelectedLayerId] = useState<string>();
  const [assets, setAssets] = useState<AssetDto[]>([]);
  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadErrorKey, setUploadErrorKey] = useState<string>();
  const [activeTool, setActiveTool] = useState<EditorTool | null>(null);
  const [layerPreview, setLayerPreview] = useState<LayerPreview>();
  const documentRef = useRef<ProjectDocument | undefined>(undefined);
  const pastRef = useRef<ProjectDocument[]>([]);
  const futureRef = useRef<ProjectDocument[]>([]);
  const changeSequenceRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const durationMs = detail
    ? resolveSceneDurationMs(detail.document, selectedSceneIndex)
    : MIN_VIDEO_DURATION_MS;

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    void Promise.all([
      apiRequest<ProjectDetailDto>(`/projects/${projectId}`),
      apiRequest<AssetListDto>("/assets?status=ready"),
    ])
      .then(([result, assetList]) => {
        if (!active) return;
        const document = ensureCanvas(result.document);
        setDetail({ ...result, document });
        documentRef.current = document;
        if (document !== result.document) setSaveState("dirty");
        setAssets(assetList.items);
      })
      .catch(() => {
        if (active) setSaveState("error");
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let previous: number | undefined;
    const tick = (timestamp: number) => {
      const elapsed = previous === undefined ? 0 : timestamp - previous;
      previous = timestamp;
      setTimeMs((current) => (current + elapsed) % durationMs);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [durationMs, playing]);

  useEffect(() => {
    setTimeMs((current) => Math.min(current, durationMs - 1));
  }, [durationMs]);

  useEffect(() => {
    if (
      saveState !== "dirty" ||
      !detail ||
      !projectId ||
      saveInFlightRef.current
    )
      return;
    const timer = globalThis.setTimeout(() => {
      const documentToSave = documentRef.current;
      if (!documentToSave) return;
      const savingSequence = changeSequenceRef.current;
      saveInFlightRef.current = true;
      setSaveState("saving");
      void apiRequest<ProjectDetailDto>(`/projects/${projectId}/revisions`, {
        method: "POST",
        body: JSON.stringify({
          lock_version: detail.project.lock_version,
          document: documentToSave,
          change_summary: "auto save",
        }),
      })
        .then((saved) => {
          saveInFlightRef.current = false;
          if (changeSequenceRef.current === savingSequence) {
            setDetail(saved);
            documentRef.current = saved.document;
            setSaveState("saved");
            return;
          }
          const currentDocument = documentRef.current;
          setDetail(
            currentDocument ? { ...saved, document: currentDocument } : saved,
          );
          setSaveState("dirty");
        })
        .catch((error: unknown) => {
          saveInFlightRef.current = false;
          setSaveState(
            error instanceof ApiError && error.status === 409
              ? "conflict"
              : "error",
          );
        });
    }, 800);
    return () => globalThis.clearTimeout(timer);
  }, [detail, projectId, saveState]);

  function applyDocument(document: ProjectDocument, recordHistory = true) {
    const previousDocument = documentRef.current;
    if (!previousDocument) return;
    if (recordHistory) {
      pastRef.current = [...pastRef.current.slice(-49), previousDocument];
      futureRef.current = [];
    }
    changeSequenceRef.current += 1;
    documentRef.current = document;
    setDetail((current) => (current ? { ...current, document } : current));
    setSaveState("dirty");
  }

  function mutate(mutator: (document: ProjectDocument) => void) {
    const currentDocument = documentRef.current;
    if (!currentDocument) return;
    const document = structuredClone(currentDocument);
    mutator(document);
    applyDocument(document);
  }

  function undo() {
    if (!detail || pastRef.current.length === 0) return;
    const previous = pastRef.current.at(-1);
    if (!previous) return;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [detail.document, ...futureRef.current].slice(0, 50);
    applyDocument(previous, false);
  }

  function redo() {
    if (!detail || futureRef.current.length === 0) return;
    const [next, ...rest] = futureRef.current;
    if (!next) return;
    futureRef.current = rest;
    pastRef.current = [...pastRef.current, detail.document].slice(-50);
    applyDocument(next, false);
  }

  function updateScene(mutator: (scene: Scene) => void) {
    mutate((document) => {
      const scene = document.scenes[0];
      if (scene) mutator(scene);
    });
  }

  function addDialogue() {
    updateScene((scene) =>
      scene.dialogues.push({
        id: crypto.randomUUID(),
        speaker: null,
        text: t("editor.newDialogue"),
        display_effect: "typewriter",
        duration_mode: "auto",
        duration_ms: null,
        manual_page_breaks: [],
      }),
    );
  }

  function updateDialogue(dialogueId: string, patch: Partial<Dialogue>) {
    updateScene((scene) => {
      const dialogue = scene.dialogues.find((item) => item.id === dialogueId);
      if (dialogue) Object.assign(dialogue, patch);
    });
  }

  function addLayer(layer: Layer) {
    updateScene((scene) => scene.layers.push(layer));
    setSelectedLayerId(layer.id);
  }

  function addImageLayer(asset: AssetDto) {
    if (!detail) return;
    const fitted = fitImageToCanvas(asset, detail.document.video);
    addLayer({
      id: crypto.randomUUID(),
      type: "image",
      asset_id: asset.id,
      ...fitted,
      rotation: 0,
      opacity: 1,
      start_ms: 0,
      end_ms: durationMs,
    });
  }

  function addUploadedImageLayer(asset: AssetDto, sceneId: string) {
    if (!detail) return;
    const layerId = crypto.randomUUID();
    const video = detail.document.video;
    const fitted = fitImageToCanvas(asset, video);
    mutate((document) => {
      const targetScene = document.scenes.find((item) => item.id === sceneId);
      targetScene?.layers.push({
        id: layerId,
        type: "image",
        asset_id: asset.id,
        ...fitted,
        rotation: 0,
        opacity: 1,
        start_ms: 0,
        end_ms: durationMs,
      });
    });
    setSelectedLayerId(layerId);
  }

  async function uploadDroppedImage(file: File, sceneId: string) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setUploadErrorKey("errors.imageUploadOnly");
      return;
    }
    setUploadingImage(true);
    setUploadErrorKey(undefined);
    try {
      const target = await apiRequest<UploadTargetDto>("/assets/uploads", {
        method: "POST",
        body: JSON.stringify({
          name: file.name,
          original_filename: file.name,
          kind: "image",
        }),
      });
      await apiUpload(target.upload_path, file);
      const completed = await apiRequest<AssetDto>(
        `/assets/${target.asset.id}/complete`,
        { method: "POST" },
      );
      setAssets((current) => [completed, ...current]);
      addUploadedImageLayer(completed, sceneId);
    } catch (error) {
      setUploadErrorKey(
        error instanceof ApiError ? error.messageKey : "errors.unknown",
      );
    } finally {
      setUploadingImage(false);
    }
  }

  function dropImage(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDropActive(false);
    if (!scene || uploadingImage) return;
    const file = event.dataTransfer.files.item(0);
    if (file) void uploadDroppedImage(file, scene.id);
  }

  useEffect(() => {
    const pasteImage = (event: ClipboardEvent) => {
      if (isEditableShortcutTarget(event.target) || uploadingImage) return;
      const sceneId = documentRef.current?.scenes[0]?.id;
      const file = clipboardImageFile(event);
      if (!sceneId || !file) return;
      event.preventDefault();
      void uploadDroppedImage(file, sceneId);
    };
    window.addEventListener("paste", pasteImage);
    return () => window.removeEventListener("paste", pasteImage);
  }, [detail, uploadingImage]);

  function updateLayer(layerId: string, patch: Partial<Layer>) {
    updateScene((scene) => {
      const layer = scene.layers.find((item) => item.id === layerId);
      if (layer)
        applyLayerPatchAtTime(
          layer,
          patch,
          snapKeyframeTime(timeMs, durationMs),
          () => crypto.randomUUID(),
        );
    });
  }

  function applyAnimationPreset(
    layerId: string,
    preset: LayerAnimationPreset,
    presetDurationMs: number,
  ) {
    mutate((document) => {
      const requiredDuration = roundVideoDurationMs(timeMs + presetDurationMs);
      if (
        requiredDuration > resolveSceneDurationMs(document, selectedSceneIndex)
      )
        document.video.duration_ms = requiredDuration;
      const actualDuration = resolveSceneDurationMs(
        document,
        selectedSceneIndex,
      );
      const layer = document.scenes[selectedSceneIndex]?.layers.find(
        (item) => item.id === layerId,
      );
      if (layer)
        applyLayerAnimationPreset(
          layer,
          preset,
          snapKeyframeTime(timeMs, actualDuration),
          presetDurationMs,
          {
            width: detail?.document.video.width ?? 1920,
            height: detail?.document.video.height ?? 1080,
            durationMs: actualDuration,
          },
          () => crypto.randomUUID(),
        );
    });
  }

  function clearAnimation(layerId: string) {
    updateScene((scene) => {
      const layer = scene.layers.find((item) => item.id === layerId);
      if (layer) clearLayerAnimation(layer);
    });
  }

  function deleteKeyframe(layerId: string, keyframeId: string) {
    updateScene((scene) => {
      const layer = scene.layers.find((item) => item.id === layerId);
      if (layer) deleteLayerKeyframe(layer, keyframeId);
    });
  }

  function duplicateKeyframe(
    layerId: string,
    keyframeId: string,
    requestedTimeMs: number,
  ) {
    updateScene((scene) => {
      const layer = scene.layers.find((item) => item.id === layerId);
      if (layer)
        duplicateLayerKeyframe(
          layer,
          keyframeId,
          snapKeyframeTime(requestedTimeMs, durationMs),
          () => crypto.randomUUID(),
        );
    });
  }

  function updateKeyframeEasing(
    layerId: string,
    keyframeId: string,
    easing: LayerEasing,
  ) {
    updateScene((scene) => {
      const layer = scene.layers.find((item) => item.id === layerId);
      if (layer) changeLayerKeyframeEasing(layer, keyframeId, easing);
    });
  }

  function reorderLayer(
    sourceIndex: number,
    targetIndex: number,
    position: "before" | "after",
  ) {
    let destinationIndex = targetIndex + (position === "after" ? 1 : 0);
    if (sourceIndex < destinationIndex) destinationIndex -= 1;
    if (sourceIndex === destinationIndex) return;
    updateScene((scene) => {
      const [movedLayer] = scene.layers.splice(sourceIndex, 1);
      if (movedLayer) scene.layers.splice(destinationIndex, 0, movedLayer);
    });
  }

  function mergeLayerTrack(sourceLayerId: string, targetLayerId: string) {
    updateScene((scene) => {
      const source = scene.layers.find((layer) => layer.id === sourceLayerId);
      const target = scene.layers.find((layer) => layer.id === targetLayerId);
      if (!source || !target) return;
      const sourceTrackId = source.track_id ?? source.id;
      const targetTrackId = target.track_id ?? target.id;
      if (sourceTrackId === targetTrackId) return;
      const sourceLayers = scene.layers.filter(
        (layer) => (layer.track_id ?? layer.id) === sourceTrackId,
      );
      const targetLayers = scene.layers.filter(
        (layer) => (layer.track_id ?? layer.id) === targetTrackId,
      );
      const sourceStartMs = Math.min(
        ...sourceLayers.map((layer) => layer.start_ms ?? 0),
      );
      const targetEndMs = Math.max(
        ...targetLayers.map((layer) => layer.end_ms ?? durationMs),
      );
      const shiftMs = Math.max(0, targetEndMs - sourceStartMs);
      for (const layer of sourceLayers) {
        layer.start_ms = (layer.start_ms ?? 0) + shiftMs;
        layer.end_ms = (layer.end_ms ?? durationMs) + shiftMs;
        for (const keyframe of layer.keyframes ?? [])
          keyframe.time_ms += shiftMs;
      }
      for (const layer of scene.layers) {
        if ((layer.track_id ?? layer.id) === sourceTrackId)
          layer.track_id = targetTrackId;
        if ((layer.track_id ?? layer.id) === targetTrackId)
          layer.track_id = targetTrackId;
      }
    });
  }

  function splitLayerTrack(layerId: string) {
    updateScene((scene) => {
      const layer = scene.layers.find((item) => item.id === layerId);
      if (layer) layer.track_id = undefined;
    });
  }

  function addAudioTrack(asset: AssetDto) {
    mutate((document) => {
      document.audio_tracks ??= [];
      document.audio_tracks.push({
        id: crypto.randomUUID(),
        asset_id: asset.id,
        role: "bgm",
        scene_id: null,
        dialogue_id: null,
        start_ms: 0,
        duration_ms: asset.duration_ms ?? undefined,
        trim_start_ms: 0,
        volume: 0.7,
        loop: true,
        fade_in_ms: 0,
        fade_out_ms: 0,
        ducking: true,
      });
    });
  }

  function addCameraEffect(preset: CameraPreset) {
    mutate((document) => {
      document.camera_effects ??= [];
      document.camera_effects.push({
        id: crypto.randomUUID(),
        preset,
        start_ms: 0,
        end_ms: durationMs,
        intensity: 1,
        period_ms: preset === "handheld" ? 900 : preset === "walk" ? 700 : 4000,
      });
    });
  }

  function updateCameraEffect(effectId: string, patch: Partial<CameraEffect>) {
    mutate((document) => {
      const effect = document.camera_effects?.find(
        (item) => item.id === effectId,
      );
      if (effect) Object.assign(effect, patch);
    });
  }

  function deleteCameraEffect(effectId: string) {
    mutate((document) => {
      document.camera_effects = document.camera_effects?.filter(
        (effect) => effect.id !== effectId,
      );
    });
  }

  function setManualDuration(requestedDurationMs: number) {
    mutate((document) => {
      document.video.duration_ms = Math.max(
        MIN_VIDEO_DURATION_MS,
        Math.min(3_600_000, Math.round(requestedDurationMs)),
      );
    });
  }

  function updateLayerRange(
    layerId: string,
    range: { startMs: number; endMs: number },
  ) {
    const currentLayer = documentRef.current?.scenes[
      selectedSceneIndex
    ]?.layers.find((item) => item.id === layerId);
    const currentEndMs = currentLayer?.end_ms ?? durationMs;
    if (range.endMs >= durationMs - 50 && currentEndMs < durationMs - 50) {
      const expandedDuration = durationMs + VIDEO_DURATION_STEP_MS;
      mutate((document) => {
        document.video.duration_ms = expandedDuration;
        const layer = document.scenes[selectedSceneIndex]?.layers.find(
          (item) => item.id === layerId,
        );
        if (layer) {
          layer.start_ms = range.startMs;
          layer.end_ms = expandedDuration;
        }
      });
      return;
    }
    updateLayer(layerId, {
      start_ms: range.startMs,
      end_ms: range.endMs,
    });
  }

  function updateAudioTrack(trackId: string, patch: Partial<AudioTrack>) {
    mutate((document) => {
      const track = document.audio_tracks?.find((item) => item.id === trackId);
      if (track) Object.assign(track, patch);
    });
  }

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        isEditableShortcutTarget(event.target)
      )
        return;

      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (key === "y") {
        event.preventDefault();
        redo();
        return;
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [detail]);

  if (!detail) {
    return (
      <main className="loading-screen">
        {t(saveState === "error" ? "errors.unknown" : "loading")}
      </main>
    );
  }

  const project = detail.document;
  const scene = project.scenes[selectedSceneIndex];
  const previewProject = {
    ...project,
    scenes: project.scenes.map((item, sceneIndex) =>
      sceneIndex === selectedSceneIndex
        ? {
            ...item,
            layers: item.layers.map((layer) => {
              const resolved = resolveLayerAtTime(layer, timeMs);
              return layer.id === layerPreview?.layerId
                ? { ...resolved, ...layerPreview.patch, keyframes: undefined }
                : resolved;
            }),
          }
        : item,
    ),
  };
  const previewScene = previewProject.scenes[selectedSceneIndex];
  const selectedLayer = previewScene?.layers.find(
    (layer) => layer.id === selectedLayerId,
  );
  const imageAssets = assets.filter((asset) => asset.kind === "image");
  const audioAssets = assets.filter((asset) => asset.kind === "audio");

  return (
    <main className="editor-shell">
      <div className="editor-workspace">
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
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              ) {
                setDropActive(false);
              }
            }}
            onDrop={dropImage}
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
                  sceneIndex={selectedSceneIndex}
                  timeMs={timeMs}
                  assetUrl={assetContentUrl}
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
                    onCommit={(layerId, patch) => updateLayer(layerId, patch)}
                    onPreview={(layerId, patch) =>
                      setLayerPreview(patch ? { layerId, patch } : undefined)
                    }
                    onSelect={setSelectedLayerId}
                    selectedLayerId={selectedLayerId}
                    unlockLabel={t("editor.unlock")}
                    width={project.video.width}
                  />
                ) : null}
              </div>
            ) : (
              <p>{t("editor.noScenes")}</p>
            )}
            {scene && (dropActive || uploadingImage) ? (
              <div className="image-drop-overlay" role="status">
                {t(
                  uploadingImage
                    ? "editor.imageUploading"
                    : "editor.imageDropHere",
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
          {scene ? (
            <FloatingEditorTools
              activeTool={activeTool}
              labels={{
                scene: t("editor.tool.scene"),
                dialogues: t("editor.tool.dialogues"),
                layers: t("editor.tool.layers"),
                camera: t("editor.tool.camera"),
                audio: t("editor.tool.audio"),
                caption: t("editor.tool.caption"),
              }}
              onSelect={setActiveTool}
              toolbarLabel={t("editor.toolbarLabel")}
            />
          ) : null}
        </section>

        <section className="editor-timeline-area">
          {scene ? (
            <ObjectTimeline
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
              onDeleteKeyframe={deleteKeyframe}
              onDuplicateKeyframe={duplicateKeyframe}
              onKeyframeEasingChange={updateKeyframeEasing}
              onMergeTrack={mergeLayerTrack}
              onPlay={() => setPlaying(true)}
              onRename={(layerId, name) => updateLayer(layerId, { name })}
              onReorder={reorderLayer}
              onChange={updateLayerRange}
              onExtend={() =>
                setManualDuration(durationMs + VIDEO_DURATION_STEP_MS)
              }
              onSeek={(value) => {
                setPlaying(false);
                setTimeMs(value === durationMs ? value - 1 : value);
              }}
              onSelect={(layerId) => setSelectedLayerId(layerId)}
              onSplitTrack={splitLayerTrack}
              onStop={() => {
                setPlaying(false);
                setTimeMs(0);
              }}
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
            />
          ) : null}
        </section>

        {scene && activeTool ? (
          <aside
            className="property-panel"
            aria-label={t(`editor.tool.${activeTool}`)}
          >
            <div className="floating-panel-header">
              <h2>{t(`editor.tool.${activeTool}`)}</h2>
              <button
                type="button"
                aria-label={t("editor.closeTools")}
                title={t("editor.closeTools")}
                onClick={() => setActiveTool(null)}
              >
                ×
              </button>
            </div>
            <>
              <details open hidden={activeTool !== "scene"}>
                <summary>{t("editor.sceneSettings")}</summary>
                <NumberField
                  label={t("editor.videoDurationSeconds")}
                  value={durationMs / 1000}
                  min={5}
                  max={3600}
                  step={5}
                  onChange={(value) => setManualDuration(value * 1000)}
                />
                <p className="field-hint">{t("editor.durationAutoHint")}</p>
                <label>
                  <span>{t("editor.backgroundColor")}</span>
                  <input
                    type="color"
                    value={
                      scene.background.type === "color"
                        ? scene.background.color
                        : "#16324f"
                    }
                    onChange={(event) =>
                      updateScene((item) => {
                        item.background = {
                          type: "color",
                          color: event.target.value,
                        };
                      })
                    }
                  />
                </label>
              </details>

              <details open hidden={activeTool !== "dialogues"}>
                <summary>{t("editor.dialogues")}</summary>
                <button type="button" onClick={addDialogue}>
                  {t("editor.addDialogue")}
                </button>
                {scene.dialogues.map((dialogue) => (
                  <div className="dialogue-editor" key={dialogue.id}>
                    <textarea
                      aria-label={t("editor.dialogueText")}
                      value={dialogue.text}
                      onChange={(event) =>
                        updateDialogue(dialogue.id, {
                          text: event.target.value,
                        })
                      }
                    />
                    <div className="field-row">
                      <label>
                        <span>{t("editor.effect")}</span>
                        <select
                          value={dialogue.display_effect}
                          onChange={(event) =>
                            updateDialogue(dialogue.id, {
                              display_effect: event.target
                                .value as Dialogue["display_effect"],
                            })
                          }
                        >
                          <option value="typewriter">Typewriter</option>
                          <option value="fade">Fade</option>
                          <option value="instant">Instant</option>
                        </select>
                      </label>
                      <label>
                        <span>{t("editor.duration")}</span>
                        <select
                          value={dialogue.duration_mode}
                          onChange={(event) =>
                            updateDialogue(dialogue.id, {
                              duration_mode: event.target
                                .value as Dialogue["duration_mode"],
                            })
                          }
                        >
                          <option value="auto">Auto</option>
                          <option value="manual">Manual</option>
                          <option value="narration">Narration</option>
                        </select>
                      </label>
                    </div>
                    {dialogue.duration_mode === "manual" ? (
                      <NumberField
                        label={t("editor.durationMs")}
                        value={dialogue.duration_ms ?? 3000}
                        min={1}
                        onChange={(value) =>
                          updateDialogue(dialogue.id, {
                            duration_ms: Math.round(value),
                          })
                        }
                      />
                    ) : null}
                    <button
                      type="button"
                      className="danger"
                      onClick={() =>
                        updateScene((item) => {
                          item.dialogues = item.dialogues.filter(
                            (value) => value.id !== dialogue.id,
                          );
                        })
                      }
                    >
                      {t("editor.delete")}
                    </button>
                  </div>
                ))}
              </details>

              <details open hidden={activeTool !== "layers"}>
                <summary>{t("editor.layers")}</summary>
                <div className="panel-actions">
                  <button
                    type="button"
                    onClick={() =>
                      addLayer({
                        id: crypto.randomUUID(),
                        type: "text",
                        text: t("editor.newText"),
                        font_size: 64,
                        color: "#ffffff",
                        x: 160,
                        y: 140,
                        width: 800,
                        height: 120,
                        rotation: 0,
                        opacity: 1,
                        start_ms: 0,
                        end_ms: durationMs,
                      })
                    }
                  >
                    {t("editor.addText")}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      addLayer({
                        id: crypto.randomUUID(),
                        type: "shape",
                        shape: "rectangle",
                        fill: "#3ea6ff",
                        x: 160,
                        y: 140,
                        width: 400,
                        height: 240,
                        rotation: 0,
                        opacity: 1,
                        start_ms: 0,
                        end_ms: durationMs,
                      })
                    }
                  >
                    {t("editor.addShape")}
                  </button>
                </div>
                <div className="asset-picker">
                  {imageAssets.map((asset) => (
                    <button
                      type="button"
                      key={asset.id}
                      onClick={() => addImageLayer(asset)}
                    >
                      <img src={assetContentUrl(asset.id)} alt="" />
                      <span>{asset.name}</span>
                    </button>
                  ))}
                </div>
                {scene.layers.map((layer) => (
                  <button
                    type="button"
                    className={
                      selectedLayerId === layer.id
                        ? "layer-row layer-row--active"
                        : "layer-row"
                    }
                    key={layer.id}
                    onClick={() => setSelectedLayerId(layer.id)}
                  >
                    {t(`editor.layerType.${layer.type}`)}
                  </button>
                ))}
              </details>

              {selectedLayer ? (
                <details open hidden={activeTool !== "layers"}>
                  <summary>{t("editor.layerSettings")}</summary>
                  {selectedLayer.type === "text" ? (
                    <label>
                      <span>{t("editor.text")}</span>
                      <input
                        value={selectedLayer.text}
                        onChange={(event) =>
                          updateLayer(selectedLayer.id, {
                            text: event.target.value,
                          })
                        }
                      />
                    </label>
                  ) : null}
                  {selectedLayer.type === "shape" ? (
                    <label>
                      <span>{t("editor.color")}</span>
                      <input
                        type="color"
                        value={selectedLayer.fill}
                        onChange={(event) =>
                          updateLayer(selectedLayer.id, {
                            fill: event.target.value,
                          })
                        }
                      />
                    </label>
                  ) : null}
                  <div className="property-grid">
                    {(
                      [
                        "x",
                        "y",
                        "width",
                        "height",
                        "rotation",
                        "opacity",
                      ] as const
                    ).map((key) => (
                      <NumberField
                        key={key}
                        label={key}
                        value={selectedLayer[key]}
                        min={key === "opacity" ? 0 : undefined}
                        max={key === "opacity" ? 1 : undefined}
                        step={key === "opacity" ? 0.05 : 1}
                        onChange={(value) =>
                          updateLayer(selectedLayer.id, { [key]: value })
                        }
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      updateScene((item) => {
                        item.layers = item.layers.filter(
                          (layer) => layer.id !== selectedLayer.id,
                        );
                      });
                      setSelectedLayerId(undefined);
                    }}
                  >
                    {t("editor.delete")}
                  </button>
                </details>
              ) : null}

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
                      onClick={() => addCameraEffect(preset)}
                    >
                      {t(`editor.cameraPreset.${preset}`)}
                    </button>
                  ))}
                </div>
                {(project.camera_effects ?? []).map((effect) => (
                  <div className="camera-effect-editor" key={effect.id}>
                    <strong>{t(`editor.cameraPreset.${effect.preset}`)}</strong>
                    <div className="property-grid">
                      <NumberField
                        label={t("editor.startSeconds")}
                        value={effect.start_ms / 1000}
                        min={0}
                        step={0.1}
                        onChange={(value) =>
                          updateCameraEffect(effect.id, {
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
                          updateCameraEffect(effect.id, {
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
                          updateCameraEffect(effect.id, { intensity: value })
                        }
                      />
                      <NumberField
                        label={t("editor.periodSeconds")}
                        value={effect.period_ms / 1000}
                        min={0.1}
                        step={0.1}
                        onChange={(value) =>
                          updateCameraEffect(effect.id, {
                            period_ms: Math.max(100, Math.round(value * 1000)),
                          })
                        }
                      />
                    </div>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => deleteCameraEffect(effect.id)}
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
                      onClick={() => addAudioTrack(asset)}
                    >
                      {asset.name}
                    </button>
                  ))}
                </div>
                {(project.audio_tracks ?? []).map((track) => (
                  <div className="audio-track" key={track.id}>
                    <label>
                      <span>{t("editor.audioRole")}</span>
                      <select
                        value={track.role}
                        onChange={(event) =>
                          updateAudioTrack(track.id, {
                            role: event.target.value as AudioTrack["role"],
                          })
                        }
                      >
                        <option value="narration">Narration</option>
                        <option value="bgm">BGM</option>
                        <option value="effect">Effect</option>
                      </select>
                    </label>
                    <NumberField
                      label={t("editor.volume")}
                      value={track.volume}
                      min={0}
                      max={2}
                      step={0.05}
                      onChange={(value) =>
                        updateAudioTrack(track.id, { volume: value })
                      }
                    />
                    <button
                      type="button"
                      className="danger"
                      onClick={() =>
                        mutate((document) => {
                          document.audio_tracks = document.audio_tracks?.filter(
                            (item) => item.id !== track.id,
                          );
                        })
                      }
                    >
                      {t("editor.delete")}
                    </button>
                  </div>
                ))}
              </details>

              <details open hidden={activeTool !== "caption"}>
                <summary>{t("editor.captionStyle")}</summary>
                <div className="property-grid">
                  {(["x", "y", "width", "height"] as const).map((key) => (
                    <NumberField
                      key={key}
                      label={key}
                      value={project.caption_style[key]}
                      min={key === "width" || key === "height" ? 1 : undefined}
                      onChange={(value) =>
                        mutate((document) => {
                          document.caption_style[key] = value;
                        })
                      }
                    />
                  ))}
                  <NumberField
                    label={t("editor.fontSize")}
                    value={project.caption_style.font_size}
                    min={8}
                    onChange={(value) =>
                      mutate((document) => {
                        document.caption_style.font_size = value;
                      })
                    }
                  />
                  <NumberField
                    label={t("editor.maxLines")}
                    value={project.caption_style.max_lines}
                    min={1}
                    max={20}
                    onChange={(value) =>
                      mutate((document) => {
                        document.caption_style.max_lines = value;
                      })
                    }
                  />
                  <label>
                    <span>{t("editor.textColor")}</span>
                    <input
                      type="color"
                      value={project.caption_style.text_color}
                      onChange={(event) =>
                        mutate((document) => {
                          document.caption_style.text_color =
                            event.target.value;
                        })
                      }
                    />
                  </label>
                </div>
              </details>
            </>
          </aside>
        ) : null}
      </div>
    </main>
  );
}
