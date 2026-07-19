import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";

import type { ProjectDocument } from "@douga/project-schema";
import {
  MIN_VIDEO_DURATION_MS,
  resolveSceneDurationMs,
  roundVideoDurationMs,
  type LayerEasing,
} from "@douga/scene-renderer";

import type { AssetDto } from "../../../shared/lib/api";
import type { Layer, Scene } from "../lib/editorTypes";
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
import type { TimelineRange } from "../lib/timelineRange";
import {
  cutTimelineAt as cutProjectTimelineAt,
  resizeTimeline,
} from "../lib/timelineCut";
import { deleteTimelineRange as deleteProjectTimelineRange } from "../lib/timelineRangeDelete";
import { insertTimelineRange as insertProjectTimelineRange } from "../lib/timelineRangeInsert";
import {
  moveLayerClipToTrack,
  updateLayerTimelineRange,
} from "../lib/layerTracks";
import {
  createTextLayer,
  duplicateTextLayer,
  type TextLayer,
  type TextWritingMode,
} from "../lib/textLayers";

export interface LayerEditorActionsOptions {
  durationMs: number;
  mutate: (mutator: (document: ProjectDocument) => void) => void;
  sceneIndex: number;
  setSelectedLayerId: Dispatch<SetStateAction<string | undefined>>;
  timeMs: number;
  updateScene: (mutator: (scene: Scene) => void) => void;
  video?: ProjectDocument["video"];
}

export function useLayerEditorActions({
  durationMs,
  mutate,
  sceneIndex,
  setSelectedLayerId,
  timeMs,
  updateScene,
  video,
}: LayerEditorActionsOptions) {
  const { t } = useTranslation();

  function addLayer(layer: Layer) {
    updateScene((scene) => scene.layers.push(layer));
    setSelectedLayerId(layer.id);
  }

  function addTextLayer(writingMode: TextWritingMode = "horizontal") {
    addLayer(
      createTextLayer({
        durationMs,
        id: crypto.randomUUID(),
        startMs: timeMs,
        text: t("editor.newText"),
        video,
        writingMode,
      }),
    );
  }

  function pasteTextLayer(source: TextLayer) {
    addLayer(
      duplicateTextLayer(source, crypto.randomUUID(), () =>
        crypto.randomUUID(),
      ),
    );
  }

  function addShapeLayer() {
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
      start_ms: timeMs,
      end_ms: durationMs,
    });
  }

  function addImageLayer(asset: AssetDto) {
    if (!video) return;
    addLayer(imageLayer(asset, video, durationMs));
  }

  function addUploadedImageLayer(asset: AssetDto, sceneId: string) {
    if (!video) return;
    const layer = imageLayer(asset, video, durationMs);
    mutate((document) => {
      document.scenes.find((scene) => scene.id === sceneId)?.layers.push(layer);
    });
    setSelectedLayerId(layer.id);
  }

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

  function applyAnimation(
    layerId: string,
    preset: LayerAnimationPreset,
    presetDurationMs: number,
  ) {
    mutate((document) => {
      const requiredDuration = roundVideoDurationMs(timeMs + presetDurationMs);
      if (requiredDuration > resolveSceneDurationMs(document, sceneIndex))
        document.video.duration_ms = requiredDuration;
      const actualDuration = resolveSceneDurationMs(document, sceneIndex);
      const layer = document.scenes[sceneIndex]?.layers.find(
        (item) => item.id === layerId,
      );
      if (layer)
        applyLayerAnimationPreset(
          layer,
          preset,
          snapKeyframeTime(timeMs, actualDuration),
          presetDurationMs,
          {
            width: video?.width ?? 1920,
            height: video?.height ?? 1080,
            durationMs: actualDuration,
          },
          () => crypto.randomUUID(),
        );
    });
  }

  function clearAnimation(layerId: string) {
    updateLayerObject(layerId, clearLayerAnimation);
  }

  function deleteKeyframe(layerId: string, keyframeId: string) {
    updateLayerObject(layerId, (layer) =>
      deleteLayerKeyframe(layer, keyframeId),
    );
  }

  function deleteLayer(layerId: string) {
    updateScene((scene) => {
      scene.layers = scene.layers.filter((layer) => layer.id !== layerId);
    });
    setSelectedLayerId((selected) =>
      selected === layerId ? undefined : selected,
    );
  }

  function duplicateKeyframe(
    layerId: string,
    keyframeId: string,
    requestedTimeMs: number,
  ) {
    updateLayerObject(layerId, (layer) =>
      duplicateLayerKeyframe(
        layer,
        keyframeId,
        snapKeyframeTime(requestedTimeMs, durationMs),
        () => crypto.randomUUID(),
      ),
    );
  }

  function updateKeyframeEasing(
    layerId: string,
    keyframeId: string,
    easing: LayerEasing,
  ) {
    updateLayerObject(layerId, (layer) =>
      changeLayerKeyframeEasing(layer, keyframeId, easing),
    );
  }

  function updateLayerObject(layerId: string, update: (layer: Layer) => void) {
    updateScene((scene) => {
      const layer = scene.layers.find((item) => item.id === layerId);
      if (layer) update(layer);
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
        const id = layer.track_id ?? layer.id;
        if (id === sourceTrackId || id === targetTrackId)
          layer.track_id = targetTrackId;
      }
    });
  }

  function splitLayerTrack(layerId: string) {
    updateLayerObject(layerId, (layer) => {
      layer.track_id = undefined;
    });
  }

  function moveLayerToTrack(
    layerId: string,
    targetLayerId: string,
    range: TimelineRange,
  ) {
    updateScene((scene) => {
      moveLayerClipToTrack(scene.layers, layerId, targetLayerId, range);
    });
  }

  function cutTimelineAt(requestedTimeMs: number) {
    let cutMs = MIN_VIDEO_DURATION_MS;
    mutate((document) => {
      cutMs = cutProjectTimelineAt(document, requestedTimeMs);
    });
    return cutMs;
  }

  function resizeTimelineTo(requestedDurationMs: number) {
    let resizedDurationMs = MIN_VIDEO_DURATION_MS;
    mutate((document) => {
      resizedDurationMs = resizeTimeline(
        document,
        requestedDurationMs,
        sceneIndex,
      );
    });
    return resizedDurationMs;
  }

  function deleteTimelineRange(startMs: number, endMs: number) {
    let result = {
      startMs,
      endMs: startMs,
      deletedMs: 0,
      durationMs,
    };
    mutate((document) => {
      result = deleteProjectTimelineRange(document, startMs, endMs, sceneIndex);
    });
    return result;
  }

  function insertTimelineRange(atMs: number, insertedMs: number) {
    let result = { atMs, insertedMs: 0, durationMs };
    mutate((document) => {
      result = insertProjectTimelineRange(
        document,
        atMs,
        insertedMs,
        sceneIndex,
      );
    });
    return result;
  }

  function updateLayerRange(layerId: string, range: TimelineRange) {
    mutate((document) => {
      const layer = document.scenes[sceneIndex]?.layers.find(
        (item) => item.id === layerId,
      );
      if (!layer) return;
      updateLayerTimelineRange(layer, range);
    });
  }

  return {
    addImageLayer,
    addLayer,
    addShapeLayer,
    addTextLayer,
    addUploadedImageLayer,
    applyAnimationPreset: applyAnimation,
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
  };
}

function imageLayer(
  asset: AssetDto,
  video: ProjectDocument["video"],
  durationMs: number,
): Layer {
  const sourceWidth = asset.width ?? 16;
  const sourceHeight = asset.height ?? 9;
  const scale = Math.min(
    video.width / sourceWidth,
    video.height / sourceHeight,
  );
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);
  return {
    id: crypto.randomUUID(),
    type: "image",
    asset_id: asset.id,
    x: Math.round((video.width - width) / 2),
    y: Math.round((video.height - height) / 2),
    width,
    height,
    rotation: 0,
    opacity: 1,
    start_ms: 0,
    end_ms: durationMs,
  };
}
