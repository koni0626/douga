import {
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";

import {
  buildSceneTimeline,
  resolveCaptionAtTime,
  MIN_VIDEO_DURATION_MS,
  resolveLayerAtTime,
  resolveSceneDurationMs,
} from "@douga/scene-renderer";

import type {
  AssetDto,
  SpeechSynthesisSettingsDto,
} from "../../../shared/lib/api";

import { EditorPropertyPanel } from "../components/EditorPropertyPanel";
import { EditorCanvasWorkspace } from "../components/EditorCanvasWorkspace";
import { EditorTimelineArea } from "../components/EditorTimelineArea";
import { ProjectSettingsDialog } from "../components/ProjectSettingsDialog";
import type { LayerTransformPatch } from "../components/CanvasObjectEditor";
import { buildCaptionTimelineClips } from "../lib/captionTimeline";
import type { EditorTool } from "../lib/editorTypes";
import type { TextLayer } from "../lib/textLayers";
import { AssistantPanel } from "../../assistant/components/AssistantPanel";
import { useProjectDocumentEditor } from "../hooks/useProjectDocumentEditor";
import { useCaptionEditorActions } from "../hooks/useCaptionEditorActions";
import { useLayerEditorActions } from "../hooks/useLayerEditorActions";
import { useMediaEditorActions } from "../hooks/useMediaEditorActions";

type LayerPreview = { layerId: string; patch: LayerTransformPatch };
const TEXT_LAYER_CLIPBOARD_TYPE = "application/x-douga-text-layer";

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches("input, textarea, select"))
  );
}

export function ProjectEditorPage() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const selectedSceneIndex = 0;
  const {
    assets,
    detail,
    documentRef,
    mutate,
    redo,
    refresh,
    saveState,
    setAssets,
    undo,
    updateScene,
  } = useProjectDocumentEditor(projectId);
  const [selectedLayerId, setSelectedLayerId] = useState<string>();
  const [selectedCaptionId, setSelectedCaptionId] = useState<string>();
  const [selectedAudioTrackId, setSelectedAudioTrackId] = useState<string>();
  const selectLayer = useCallback<Dispatch<SetStateAction<string | undefined>>>(
    (value) => {
      setSelectedLayerId(value);
      setSelectedCaptionId(undefined);
    },
    [],
  );
  const selectCaption = useCallback((captionId: string) => {
    setSelectedLayerId(undefined);
    setSelectedCaptionId(captionId);
  }, []);
  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [audioBuffering, setAudioBuffering] = useState(false);
  const [activeTool, setActiveTool] = useState<EditorTool | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [assistantWidth, setAssistantWidth] = useState(400);
  const [captionDraft, setCaptionDraft] = useState("");
  const [captionEditing, setCaptionEditing] = useState(false);
  const [layerPreview, setLayerPreview] = useState<LayerPreview>();
  const textLayerClipboardRef = useRef<{
    layer: TextLayer;
    token: string;
  } | null>(null);
  const durationMs = detail
    ? resolveSceneDurationMs(detail.document, selectedSceneIndex)
    : MIN_VIDEO_DURATION_MS;
  const {
    addCaptionAt,
    addDialogue,
    commitInlineCaption,
    deleteCaption,
    updateCaptionRange,
    updateDialogue,
  } = useCaptionEditorActions({
    captionDraft,
    documentRef,
    sceneIndex: selectedSceneIndex,
    setCaptionEditing,
    timeMs,
    updateScene,
  });
  const {
    addImageLayer,
    addLayer,
    addShapeLayer,
    addTextLayer,
    addUploadedImageLayer,
    applyAnimationPreset,
    clearAnimation,
    cutTimelineAt,
    deleteTimelineRange,
    deleteLayer,
    deleteKeyframe,
    duplicateKeyframe,
    insertTimelineRange,
    mergeLayerTrack,
    moveLayerToTrack,
    pasteTextLayer,
    reorderLayer,
    resizeTimelineTo,
    splitLayerTrack,
    updateKeyframeEasing,
    updateLayer,
    updateLayerRange,
  } = useLayerEditorActions({
    durationMs,
    mutate,
    sceneIndex: selectedSceneIndex,
    setSelectedLayerId: selectLayer,
    timeMs,
    updateScene,
    video: detail?.document.video,
  });
  const {
    addAudioTrack,
    addCameraEffect,
    audioDropActive,
    deleteAudioTrack,
    deleteCameraEffect,
    dropActive,
    dropAudioOnTimeline,
    dropImage,
    setAudioDropActive,
    setDropActive,
    updateAudioTrack,
    updateCameraEffect,
    uploadErrorKey,
    uploadingAudio,
    uploadingImage,
  } = useMediaEditorActions({
    addUploadedImageLayer,
    documentRef,
    durationMs,
    mutate,
    setActiveTool,
    setAssets,
  });

  const resolvedCaption = useMemo(() => {
    if (!detail) return undefined;
    const scene = detail.document.scenes[selectedSceneIndex];
    if (!scene) return undefined;
    return resolveCaptionAtTime(
      buildSceneTimeline(
        scene,
        detail.document.caption_style,
        detail.document.content_locale,
      ),
      timeMs,
    );
  }, [detail, timeMs]);

  const addCaptionAndSelect = useCallback(
    (startMs: number) => {
      selectCaption(addCaptionAt(startMs));
    },
    [addCaptionAt, selectCaption],
  );
  const deleteCaptionAndClearSelection = useCallback(
    (captionId: string) => {
      deleteCaption(captionId);
      setSelectedCaptionId((selected) =>
        selected === captionId ? undefined : selected,
      );
    },
    [deleteCaption],
  );
  const deleteAudioTrackAndClearSelection = useCallback(
    (trackId: string) => {
      deleteAudioTrack(trackId);
      setSelectedAudioTrackId((selected) =>
        selected === trackId ? undefined : selected,
      );
    },
    [deleteAudioTrack],
  );

  useEffect(() => {
    if (captionEditing) return;
    setCaptionDraft(resolvedCaption?.page?.dialogue.text ?? "");
  }, [captionEditing, resolvedCaption]);

  useEffect(() => {
    if (!playing || audioBuffering) return;
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
  }, [audioBuffering, durationMs, playing]);

  useEffect(() => {
    setTimeMs((current) => Math.min(current, durationMs - 1));
  }, [durationMs]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (isEditableShortcutTarget(event.target)) return;

      if (event.key === "Delete") {
        if (selectedCaptionId) {
          event.preventDefault();
          deleteCaptionAndClearSelection(selectedCaptionId);
          return;
        }
        if (selectedLayerId) {
          event.preventDefault();
          deleteLayer(selectedLayerId);
          return;
        }
      }

      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

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
  }, [
    deleteCaptionAndClearSelection,
    deleteLayer,
    detail,
    redo,
    selectedCaptionId,
    selectedLayerId,
    undo,
  ]);

  useEffect(() => {
    const copySelectedTextLayer = (event: ClipboardEvent) => {
      if (isEditableShortcutTarget(event.target) || !selectedLayerId) return;
      const layer = documentRef.current?.scenes[
        selectedSceneIndex
      ]?.layers.find((item) => item.id === selectedLayerId);
      if (!layer || layer.type !== "text" || !event.clipboardData) return;
      const token = crypto.randomUUID();
      textLayerClipboardRef.current = {
        layer: structuredClone(layer),
        token,
      };
      event.preventDefault();
      event.clipboardData.setData(TEXT_LAYER_CLIPBOARD_TYPE, token);
      event.clipboardData.setData("text/plain", layer.text);
    };
    const pasteCopiedTextLayer = (event: ClipboardEvent) => {
      if (isEditableShortcutTarget(event.target) || !event.clipboardData)
        return;
      const clipboard = textLayerClipboardRef.current;
      const token = event.clipboardData.getData(TEXT_LAYER_CLIPBOARD_TYPE);
      if (!clipboard || !token || token !== clipboard.token) return;
      event.preventDefault();
      pasteTextLayer(clipboard.layer);
    };
    window.addEventListener("copy", copySelectedTextLayer);
    window.addEventListener("paste", pasteCopiedTextLayer);
    return () => {
      window.removeEventListener("copy", copySelectedTextLayer);
      window.removeEventListener("paste", pasteCopiedTextLayer);
    };
  }, [documentRef, pasteTextLayer, selectedLayerId]);

  if (!detail) {
    return (
      <main className="loading-screen">
        {t(saveState === "error" ? "errors.unknown" : "loading")}
      </main>
    );
  }

  const project = detail.document;
  const scene = project.scenes[selectedSceneIndex];
  const captionClips = scene
    ? buildCaptionTimelineClips(
        scene,
        project.caption_style,
        project.content_locale,
      )
    : [];
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
  function addGeneratedSpeech(
    asset: AssetDto,
    settings: SpeechSynthesisSettingsDto,
  ) {
    setAssets((current) => [asset, ...current]);
    const selectedTrack = project.audio_tracks?.find(
      (track) => track.id === selectedAudioTrackId,
    );
    if (!selectedTrack) {
      addAudioTrack(asset, timeMs, "narration", settings);
      return;
    }
    const durationMs = asset.duration_ms ?? selectedTrack.duration_ms;
    const fadeInMs = Math.min(
      selectedTrack.fade_in_ms,
      durationMs ?? selectedTrack.fade_in_ms,
    );
    updateAudioTrack(selectedTrack.id, {
      asset_id: asset.id,
      duration_ms: durationMs,
      trim_start_ms: 0,
      fade_in_ms: fadeInMs,
      fade_out_ms: Math.min(
        selectedTrack.fade_out_ms,
        Math.max(0, (durationMs ?? selectedTrack.fade_out_ms) - fadeInMs),
      ),
      speech_synthesis: settings,
    });
  }

  return (
    <main className="editor-shell">
      <div
        className={`editor-workspace${assistantOpen ? " editor-workspace--assistant-open" : ""}`}
        style={{ "--assistant-width": `${assistantWidth}px` } as CSSProperties}
      >
        <button
          aria-label={t("projects.settings.open")}
          className="project-settings-open"
          title={t("projects.settings.open")}
          type="button"
          onClick={() => setProjectSettingsOpen(true)}
        >
          <span aria-hidden="true">⚙</span>
          <strong>{project.video.fps} fps</strong>
        </button>

        <EditorCanvasWorkspace
          applyAnimationPreset={applyAnimationPreset}
          captionDraft={captionDraft}
          captionEditorVisible={Boolean(
            captionEditing || resolvedCaption?.page,
          )}
          clearAnimation={clearAnimation}
          commitInlineCaption={commitInlineCaption}
          dropActive={dropActive}
          onDrop={dropImage}
          onAudioBufferingChange={setAudioBuffering}
          playing={playing}
          previewProject={previewProject}
          previewScene={previewScene}
          project={project}
          scene={scene}
          selectedLayerId={selectedLayerId}
          setActiveTool={setActiveTool}
          setCaptionDraft={setCaptionDraft}
          setCaptionEditing={setCaptionEditing}
          setDropActive={setDropActive}
          setLayerPreview={setLayerPreview}
          setSelectedLayerId={selectLayer}
          timeMs={timeMs}
          updateLayer={updateLayer}
          uploadErrorKey={uploadErrorKey}
          uploadingImage={uploadingImage}
        />

        <EditorTimelineArea
          actions={{
            onAddCaption: addCaptionAndSelect,
            onAddShape: addShapeLayer,
            onAddTextHorizontal: () => addTextLayer("horizontal"),
            onAddTextVertical: () => addTextLayer("vertical"),
            onAudioChange: updateAudioTrack,
            onAudioDelete: deleteAudioTrackAndClearSelection,
            onCaptionChange: updateCaptionRange,
            onCaptionDelete: deleteCaptionAndClearSelection,
            onCaptionSelect: selectCaption,
            onCaptionTextChange: (dialogueId, text) =>
              updateDialogue(dialogueId, { text }),
            onChange: updateLayerRange,
            onDeleteKeyframe: deleteKeyframe,
            onDeleteLayer: deleteLayer,
            onDuplicateKeyframe: duplicateKeyframe,
            onCut: () => {
              setPlaying(false);
              const cutMs = cutTimelineAt(timeMs);
              setTimeMs(Math.max(0, cutMs - 1));
            },
            onDeleteRange: (startMs, endMs) => {
              setPlaying(false);
              const result = deleteTimelineRange(startMs, endMs);
              setTimeMs(
                Math.min(result.startMs, Math.max(0, result.durationMs - 1)),
              );
            },
            onInsertRange: (atMs, insertedMs) => {
              setPlaying(false);
              const result = insertTimelineRange(atMs, insertedMs);
              setTimeMs(result.atMs);
            },
            onDurationChange: (requestedDurationMs) => {
              setPlaying(false);
              const resizedDurationMs = resizeTimelineTo(requestedDurationMs);
              setTimeMs((current) =>
                Math.min(current, Math.max(0, resizedDurationMs - 1)),
              );
            },
            onKeyframeEasingChange: updateKeyframeEasing,
            onMergeTrack: mergeLayerTrack,
            onMoveToTrack: moveLayerToTrack,
            onPlay: () => setPlaying(true),
            onRename: (layerId, name) => updateLayer(layerId, { name }),
            onReorder: reorderLayer,
            onSeek: (value) => {
              setPlaying(false);
              setTimeMs(value === durationMs ? value - 1 : value);
            },
            onSelect: selectLayer,
            onSplitTrack: splitLayerTrack,
            onStop: () => {
              setPlaying(false);
              setTimeMs(0);
            },
          }}
          assets={assets}
          audioDropActive={audioDropActive}
          captions={captionClips}
          durationMs={durationMs}
          onDrop={dropAudioOnTimeline}
          onOpenAudioSettings={(trackId) => {
            setSelectedAudioTrackId(trackId);
            setActiveTool("audio");
          }}
          playing={playing}
          project={project}
          scene={scene}
          selectedCaptionId={selectedCaptionId}
          selectedLayerId={selectedLayerId}
          setActiveTool={setActiveTool}
          setAudioDropActive={setAudioDropActive}
          timeMs={timeMs}
          uploadingAudio={uploadingAudio}
        />

        {assistantOpen && projectId ? (
          <AssistantPanel
            canRun={saveState === "idle" || saveState === "saved"}
            editorContext={{
              selected_layer_id: selectedLayerId ?? null,
              time_ms: Math.round(timeMs),
              visible_start_ms: 0,
              visible_end_ms: durationMs,
            }}
            projectId={projectId}
            onCollapse={() => setAssistantOpen(false)}
            onProjectChanged={() => {
              setSelectedLayerId(undefined);
              void refresh();
            }}
            onWidthChange={setAssistantWidth}
            width={assistantWidth}
          />
        ) : (
          <button
            type="button"
            className="assistant-open"
            aria-label={t("assistant.expand")}
            title={t("assistant.expand")}
            onClick={() => setAssistantOpen(true)}
          >
            <span aria-hidden="true">遯ｶ・ｹ</span>
            <strong>AI</strong>
          </button>
        )}

        {scene && activeTool ? (
          <EditorPropertyPanel
            activeTool={activeTool}
            audioAssets={audioAssets}
            durationMs={durationMs}
            imageAssets={imageAssets}
            onGeneratedSpeech={addGeneratedSpeech}
            onAddCamera={addCameraEffect}
            onAddDialogue={addDialogue}
            onAddImage={addImageLayer}
            onAddLayer={addLayer}
            onClose={() => {
              setActiveTool(null);
              setSelectedAudioTrackId(undefined);
            }}
            onDeleteAudio={deleteAudioTrackAndClearSelection}
            onDeleteCamera={deleteCameraEffect}
            onDeleteDialogue={(dialogueId) =>
              updateScene((item) => {
                item.dialogues = item.dialogues.filter(
                  (dialogue) => dialogue.id !== dialogueId,
                );
              })
            }
            onDeleteLayer={deleteLayer}
            onSelectLayer={setSelectedLayerId}
            onUpdateAudio={updateAudioTrack}
            onUpdateCamera={updateCameraEffect}
            onUpdateCaption={(patch) =>
              mutate((document) => {
                Object.assign(document.caption_style, patch);
              })
            }
            onUpdateDialogue={updateDialogue}
            onUpdateLayer={updateLayer}
            project={project}
            scene={scene}
            selectedLayer={selectedLayer}
            selectedLayerId={selectedLayerId}
            selectedAudioTrackId={selectedAudioTrackId}
          />
        ) : null}

        {projectSettingsOpen ? (
          <ProjectSettingsDialog
            fps={project.video.fps}
            onApply={(fps) => {
              mutate((document) => {
                document.video.fps = fps;
              });
              setProjectSettingsOpen(false);
            }}
            onClose={() => setProjectSettingsOpen(false)}
          />
        ) : null}
      </div>
    </main>
  );
}
