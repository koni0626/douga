import type { ProjectDocument } from "@douga/project-schema";
import {
  MAX_VIDEO_DURATION_MS,
  resolveSceneDurationMs,
  VIDEO_DURATION_STEP_MS,
} from "@douga/scene-renderer";

import {
  fitAudioFades,
  resolveDialogueRanges,
  snapTimelineRangeTime,
} from "./timelineRangeUtils";

type AudioTrack = NonNullable<ProjectDocument["audio_tracks"]>[number];
type CameraEffect = NonNullable<ProjectDocument["camera_effects"]>[number];
type Layer = ProjectDocument["scenes"][number]["layers"][number];
type Scene = ProjectDocument["scenes"][number];

export interface InsertedTimelineRange {
  atMs: number;
  insertedMs: number;
  durationMs: number;
}

export function insertTimelineRange(
  document: ProjectDocument,
  requestedAtMs: number,
  requestedDurationMs: number,
  sceneIndex = 0,
  createId: () => string = () => globalThis.crypto.randomUUID(),
): InsertedTimelineRange {
  const currentDurationMs = resolveSceneDurationMs(document, sceneIndex);
  const result = normalizeInsertion(
    requestedAtMs,
    requestedDurationMs,
    currentDurationMs,
  );
  if (result.insertedMs === 0) return result;

  for (const scene of document.scenes)
    expandScene(document, scene, currentDurationMs, result, createId);
  document.audio_tracks = (document.audio_tracks ?? []).flatMap((track) =>
    expandAudioTrack(track, currentDurationMs, result, createId),
  );
  document.camera_effects = (document.camera_effects ?? []).flatMap((effect) =>
    expandCameraEffect(effect, result, createId),
  );
  document.video.duration_ms = result.durationMs;
  return result;
}

function normalizeInsertion(
  requestedAtMs: number,
  requestedDurationMs: number,
  currentDurationMs: number,
): InsertedTimelineRange {
  const atMs = snapTimelineRangeTime(requestedAtMs, currentDurationMs);
  const availableMs = MAX_VIDEO_DURATION_MS - currentDurationMs;
  const insertedMs = snapTimelineRangeTime(requestedDurationMs, availableMs);
  return {
    atMs,
    insertedMs: insertedMs >= VIDEO_DURATION_STEP_MS ? insertedMs : 0,
    durationMs:
      currentDurationMs +
      (insertedMs >= VIDEO_DURATION_STEP_MS ? insertedMs : 0),
  };
}

function expandScene(
  document: ProjectDocument,
  scene: Scene,
  currentDurationMs: number,
  insertion: InsertedTimelineRange,
  createId: () => string,
) {
  const dialogueRanges = resolveDialogueRanges(document, scene);
  scene.layers = scene.layers.flatMap((layer) =>
    expandLayer(layer, currentDurationMs, insertion, createId),
  );
  scene.dialogues = scene.dialogues.flatMap((dialogue) => {
    const range = dialogueRanges.get(dialogue.id);
    if (!range || range.endMs <= insertion.atMs) return [dialogue];
    if (range.startMs >= insertion.atMs)
      return [{ ...dialogue, start_ms: range.startMs + insertion.insertedMs }];

    const leftDurationMs = insertion.atMs - range.startMs;
    const rightDurationMs = range.endMs - insertion.atMs;
    return [
      {
        ...dialogue,
        duration_mode: "manual" as const,
        duration_ms: leftDurationMs,
      },
      {
        ...dialogue,
        id: createId(),
        start_ms: insertion.atMs + insertion.insertedMs,
        duration_mode: "manual" as const,
        duration_ms: rightDurationMs,
      },
    ];
  });
}

function expandLayer(
  layer: Layer,
  currentDurationMs: number,
  insertion: InsertedTimelineRange,
  createId: () => string,
): Layer[] {
  const startMs = layer.start_ms ?? 0;
  const endMs = layer.end_ms ?? currentDurationMs;
  if (endMs <= insertion.atMs) return [layer];
  if (startMs >= insertion.atMs)
    return [shiftLayer(layer, insertion.insertedMs)];

  const trackId = layer.track_id ?? layer.id;
  const leftKeyframes = layer.keyframes?.filter(
    (keyframe) => keyframe.time_ms <= insertion.atMs,
  );
  const rightKeyframes = layer.keyframes
    ?.filter((keyframe) => keyframe.time_ms >= insertion.atMs)
    .map((keyframe) => ({
      ...keyframe,
      time_ms: keyframe.time_ms + insertion.insertedMs,
    }));
  return [
    {
      ...layer,
      track_id: trackId,
      end_ms: insertion.atMs,
      keyframes: leftKeyframes,
    },
    {
      ...layer,
      id: createId(),
      track_id: trackId,
      start_ms: insertion.atMs + insertion.insertedMs,
      end_ms: endMs + insertion.insertedMs,
      keyframes: rightKeyframes,
    },
  ];
}

function shiftLayer(layer: Layer, insertedMs: number): Layer {
  return {
    ...layer,
    start_ms: (layer.start_ms ?? 0) + insertedMs,
    end_ms: layer.end_ms === undefined ? undefined : layer.end_ms + insertedMs,
    keyframes: layer.keyframes?.map((keyframe) => ({
      ...keyframe,
      time_ms: keyframe.time_ms + insertedMs,
    })),
  };
}

function expandAudioTrack(
  track: AudioTrack,
  currentDurationMs: number,
  insertion: InsertedTimelineRange,
  createId: () => string,
): AudioTrack[] {
  const endMs =
    track.start_ms + (track.duration_ms ?? currentDurationMs - track.start_ms);
  if (endMs <= insertion.atMs) return [track];
  if (track.start_ms >= insertion.atMs)
    return [{ ...track, start_ms: track.start_ms + insertion.insertedMs }];

  const leftDurationMs = insertion.atMs - track.start_ms;
  const rightDurationMs = endMs - insertion.atMs;
  return [
    fitAudioFades(
      { ...track, duration_ms: leftDurationMs, fade_out_ms: 0 },
      leftDurationMs,
    ),
    fitAudioFades(
      {
        ...track,
        id: createId(),
        start_ms: insertion.atMs + insertion.insertedMs,
        duration_ms: rightDurationMs,
        trim_start_ms: track.trim_start_ms + leftDurationMs,
        fade_in_ms: 0,
      },
      rightDurationMs,
    ),
  ];
}

function expandCameraEffect(
  effect: CameraEffect,
  insertion: InsertedTimelineRange,
  createId: () => string,
): CameraEffect[] {
  if (effect.end_ms <= insertion.atMs) return [effect];
  if (effect.start_ms >= insertion.atMs)
    return [
      {
        ...effect,
        start_ms: effect.start_ms + insertion.insertedMs,
        end_ms: effect.end_ms + insertion.insertedMs,
      },
    ];
  return [
    { ...effect, end_ms: insertion.atMs },
    {
      ...effect,
      id: createId(),
      start_ms: insertion.atMs + insertion.insertedMs,
      end_ms: effect.end_ms + insertion.insertedMs,
    },
  ];
}
