import { type DragEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";

import type { ProjectDocument } from "@douga/project-schema";
import { SceneRenderer } from "@douga/scene-renderer";

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

type Scene = ProjectDocument["scenes"][number];
type Layer = Scene["layers"][number];
type Dialogue = Scene["dialogues"][number];
type AudioTrack = NonNullable<ProjectDocument["audio_tracks"]>[number];
type SaveState = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";
type LayerPreview = { layerId: string; patch: LayerTransformPatch };

const SCENE_DURATION_MS = 5_000;

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
      setTimeMs((current) => (current + elapsed) % SCENE_DURATION_MS);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

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
      end_ms: SCENE_DURATION_MS,
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
        end_ms: SCENE_DURATION_MS,
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

  function updateLayer(layerId: string, patch: Partial<Layer>) {
    updateScene((scene) => {
      const layer = scene.layers.find((item) => item.id === layerId);
      if (!layer || (layer.locked && patch.locked !== false)) return;
      Object.assign(layer, patch);
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
        trim_start_ms: 0,
        volume: 0.7,
        loop: true,
        fade_in_ms: 0,
        fade_out_ms: 0,
        ducking: true,
      });
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
  const previewProject = layerPreview
    ? {
        ...project,
        scenes: project.scenes.map((item, sceneIndex) =>
          sceneIndex === selectedSceneIndex
            ? {
                ...item,
                layers: item.layers.map((layer) =>
                  layer.id === layerPreview.layerId
                    ? { ...layer, ...layerPreview.patch }
                    : layer,
                ),
              }
            : item,
        ),
      }
    : project;
  const previewScene = previewProject.scenes[selectedSceneIndex];
  const selectedLayer = scene?.layers.find(
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
                <CanvasObjectEditor
                  flipHorizontalLabel={t("editor.flipHorizontal")}
                  flipVerticalLabel={t("editor.flipVertical")}
                  height={project.video.height}
                  layers={previewScene?.layers ?? []}
                  lockLabel={t("editor.lock")}
                  lockedLabel={t("editor.locked")}
                  onCommit={(layerId, patch) => updateLayer(layerId, patch)}
                  onPreview={(layerId, patch) =>
                    setLayerPreview(patch ? { layerId, patch } : undefined)
                  }
                  onSelect={setSelectedLayerId}
                  selectedLayerId={selectedLayerId}
                  unlockLabel={t("editor.unlock")}
                  width={project.video.width}
                />
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
              durationMs={SCENE_DURATION_MS}
              expandLabel={t("editor.expandTimeline")}
              labelFor={(layer) =>
                layer.type === "text" && layer.text.trim()
                  ? layer.text
                  : t(`editor.layerType.${layer.type}`)
              }
              layers={scene.layers}
              onPlay={() => setPlaying(true)}
              onReorder={reorderLayer}
              onChange={(layerId, range) =>
                updateLayer(layerId, {
                  start_ms: range.startMs,
                  end_ms: range.endMs,
                })
              }
              onSeek={(value) => {
                setPlaying(false);
                setTimeMs(value === SCENE_DURATION_MS ? value - 1 : value);
              }}
              onSelect={(layerId) => setSelectedLayerId(layerId)}
              onStop={() => {
                setPlaying(false);
                setTimeMs(0);
              }}
              playLabel={t("play")}
              playing={playing}
              seekLabel={t("editor.timeline")}
              selectedLayerId={selectedLayerId}
              stopLabel={t("stop")}
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
                        end_ms: SCENE_DURATION_MS,
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
                        end_ms: SCENE_DURATION_MS,
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
