import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import type { ProjectDocument } from "@douga/project-schema";
import { SceneRenderer } from "@douga/scene-renderer";

import {
  ApiError,
  apiRequest,
  assetContentUrl,
  type AssetDto,
  type AssetListDto,
  type ProjectDetailDto,
} from "../../../shared/lib/api";

type Scene = ProjectDocument["scenes"][number];
type Layer = Scene["layers"][number];
type Dialogue = Scene["dialogues"][number];
type AudioTrack = NonNullable<ProjectDocument["audio_tracks"]>[number];
type SaveState = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function AudioPreview({
  tracks,
  playing,
  timeMs,
}: {
  tracks: AudioTrack[];
  playing: boolean;
  timeMs: number;
}) {
  const refs = useRef<Record<string, HTMLAudioElement | null>>({});
  useEffect(() => {
    for (const track of tracks) {
      const audio = refs.current[track.id];
      if (!audio) continue;
      const localMs = timeMs - track.start_ms + track.trim_start_ms;
      audio.volume = Math.min(1, track.volume);
      audio.loop = track.loop;
      if (localMs < 0) {
        audio.pause();
        continue;
      }
      const targetSeconds = localMs / 1000;
      if (
        Number.isFinite(audio.duration) &&
        Math.abs(audio.currentTime - targetSeconds) > 0.35
      ) {
        audio.currentTime =
          track.loop && audio.duration > 0
            ? targetSeconds % audio.duration
            : targetSeconds;
      }
      if (playing) void audio.play().catch(() => undefined);
      else audio.pause();
    }
  }, [playing, timeMs, tracks]);

  return tracks.map((track) => (
    <audio
      key={track.id}
      ref={(element) => {
        refs.current[track.id] = element;
      }}
      src={assetContentUrl(track.asset_id)}
      preload="metadata"
    />
  ));
}

export function ProjectEditorPage() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const [detail, setDetail] = useState<ProjectDetailDto>();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
  const [selectedLayerId, setSelectedLayerId] = useState<string>();
  const [assets, setAssets] = useState<AssetDto[]>([]);
  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const documentRef = useRef<ProjectDocument | undefined>(undefined);
  const pastRef = useRef<ProjectDocument[]>([]);
  const futureRef = useRef<ProjectDocument[]>([]);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    void Promise.all([
      apiRequest<ProjectDetailDto>(`/projects/${projectId}`),
      apiRequest<AssetListDto>("/assets?status=ready"),
    ])
      .then(([result, assetList]) => {
        if (!active) return;
        setDetail(result);
        documentRef.current = result.document;
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
      setTimeMs((current) => (current + elapsed) % 30_000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  useEffect(() => {
    if (saveState !== "dirty" || !detail || !projectId) return;
    const timer = globalThis.setTimeout(() => {
      const documentToSave = documentRef.current;
      if (!documentToSave) return;
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
          setDetail(saved);
          documentRef.current = saved.document;
          setSaveState("saved");
        })
        .catch((error: unknown) =>
          setSaveState(
            error instanceof ApiError && error.status === 409
              ? "conflict"
              : "error",
          ),
        );
    }, 800);
    return () => globalThis.clearTimeout(timer);
  }, [detail, projectId, saveState]);

  function applyDocument(document: ProjectDocument, recordHistory = true) {
    if (!detail) return;
    if (recordHistory) {
      pastRef.current = [...pastRef.current.slice(-49), detail.document];
      futureRef.current = [];
    }
    documentRef.current = document;
    setDetail({ ...detail, document });
    setSaveState("dirty");
  }

  function mutate(mutator: (document: ProjectDocument) => void) {
    if (!detail) return;
    const document = structuredClone(detail.document);
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

  function addScene() {
    mutate((document) => {
      document.scenes.push({
        id: crypto.randomUUID(),
        name: t("editor.defaultSceneName", {
          count: document.scenes.length + 1,
        }),
        background: { type: "color", color: "#16324f" },
        layers: [],
        dialogues: [],
      });
      setSelectedSceneIndex(document.scenes.length - 1);
    });
  }

  function updateScene(mutator: (scene: Scene) => void) {
    mutate((document) => {
      const scene = document.scenes[selectedSceneIndex];
      if (scene) mutator(scene);
    });
  }

  function duplicateScene() {
    mutate((document) => {
      const source = document.scenes[selectedSceneIndex];
      if (!source) return;
      const copy = structuredClone(source);
      copy.id = crypto.randomUUID();
      copy.name = `${source.name} ${t("editor.copySuffix")}`;
      copy.layers = copy.layers.map((layer) => ({
        ...layer,
        id: crypto.randomUUID(),
      }));
      copy.dialogues = copy.dialogues.map((dialogue) => ({
        ...dialogue,
        id: crypto.randomUUID(),
      }));
      document.scenes.splice(selectedSceneIndex + 1, 0, copy);
      setSelectedSceneIndex(selectedSceneIndex + 1);
    });
  }

  function deleteScene() {
    mutate((document) => document.scenes.splice(selectedSceneIndex, 1));
    setSelectedSceneIndex((index) => Math.max(0, index - 1));
    setSelectedLayerId(undefined);
  }

  function moveScene(direction: -1 | 1) {
    const target = selectedSceneIndex + direction;
    if (!detail || target < 0 || target >= detail.document.scenes.length)
      return;
    mutate((document) => {
      const [scene] = document.scenes.splice(selectedSceneIndex, 1);
      if (scene) document.scenes.splice(target, 0, scene);
    });
    setSelectedSceneIndex(target);
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
    addLayer({
      id: crypto.randomUUID(),
      type: "image",
      asset_id: asset.id,
      x: 240,
      y: 120,
      width: 960,
      height: 540,
      rotation: 0,
      opacity: 1,
    });
  }

  function updateLayer(layerId: string, patch: Partial<Layer>) {
    updateScene((scene) => {
      const layer = scene.layers.find((item) => item.id === layerId);
      if (layer) Object.assign(layer, patch);
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

  if (!detail) {
    return (
      <main className="loading-screen">
        {t(saveState === "error" ? "errors.unknown" : "loading")}
      </main>
    );
  }

  const project = detail.document;
  const scene = project.scenes[selectedSceneIndex];
  const selectedLayer = scene?.layers.find(
    (layer) => layer.id === selectedLayerId,
  );
  const imageAssets = assets.filter((asset) => asset.kind === "image");
  const audioAssets = assets.filter((asset) => asset.kind === "audio");

  return (
    <main className="editor-shell">
      <header className="editor-toolbar">
        <Link to="/projects">{t("editor.back")}</Link>
        <h1>{detail.project.name}</h1>
        <span className={`save-state save-state--${saveState}`}>
          {t(`editor.saveState.${saveState}`)}
        </span>
        <button
          type="button"
          onClick={undo}
          disabled={pastRef.current.length === 0}
        >
          {t("editor.undo")}
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={futureRef.current.length === 0}
        >
          {t("editor.redo")}
        </button>
        <button type="button" onClick={addScene}>
          {t("editor.addScene")}
        </button>
      </header>
      <div className="editor-workspace">
        <aside className="scene-panel">
          <h2>{t("editor.scenes")}</h2>
          {project.scenes.map((item, index) => (
            <button
              type="button"
              className={
                index === selectedSceneIndex
                  ? "scene-row scene-row--active"
                  : "scene-row"
              }
              key={item.id}
              onClick={() => {
                setSelectedSceneIndex(index);
                setSelectedLayerId(undefined);
                setTimeMs(0);
              }}
            >
              {index + 1}. {item.name}
            </button>
          ))}
          {scene ? (
            <div className="panel-actions">
              <button type="button" onClick={() => moveScene(-1)}>
                ↑
              </button>
              <button type="button" onClick={() => moveScene(1)}>
                ↓
              </button>
              <button type="button" onClick={duplicateScene}>
                {t("editor.duplicate")}
              </button>
              <button type="button" className="danger" onClick={deleteScene}>
                {t("editor.delete")}
              </button>
            </div>
          ) : null}
        </aside>

        <section className="editor-center">
          <div className="editor-preview">
            {scene ? (
              <SceneRenderer
                project={project}
                sceneIndex={selectedSceneIndex}
                timeMs={timeMs}
                assetUrl={assetContentUrl}
              />
            ) : (
              <p>{t("editor.noScenes")}</p>
            )}
          </div>
          {scene ? (
            <div className="preview-controls">
              <AudioPreview
                tracks={project.audio_tracks ?? []}
                playing={playing}
                timeMs={timeMs}
              />
              <button
                type="button"
                onClick={() => setPlaying((value) => !value)}
              >
                {t(playing ? "pause" : "play")}
              </button>
              <button type="button" onClick={() => setTimeMs(0)}>
                {t("reset")}
              </button>
              <input
                aria-label={t("editor.timeline")}
                type="range"
                min={0}
                max={30_000}
                step={50}
                value={timeMs}
                onChange={(event) => setTimeMs(Number(event.target.value))}
              />
              <span>{(timeMs / 1000).toFixed(1)}s</span>
            </div>
          ) : null}
        </section>

        <aside className="property-panel">
          {!scene ? null : (
            <>
              <details open>
                <summary>{t("editor.sceneSettings")}</summary>
                <label>
                  <span>{t("editor.sceneName")}</span>
                  <input
                    value={scene.name}
                    onChange={(event) =>
                      updateScene((item) => {
                        item.name = event.target.value;
                      })
                    }
                  />
                </label>
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

              <details open>
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

              <details open>
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
                <details open>
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

              <details>
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

              <details>
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
          )}
        </aside>
      </div>
    </main>
  );
}
