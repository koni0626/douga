import type { ProjectDocument } from "@douga/project-schema";
import {
  MIN_VIDEO_DURATION_MS,
  resolveSceneDurationMs,
  VIDEO_DURATION_STEP_MS,
} from "@douga/scene-renderer";

import {
  fitAudioFades,
  resolveDialogueRanges,
  snapTimelineRangeTime,
  type TimelineInterval,
} from "./timelineRangeUtils";

type AudioTrack = NonNullable<ProjectDocument["audio_tracks"]>[number];
type Scene = ProjectDocument["scenes"][number];

export interface DeletedTimelineRange extends TimelineInterval {
  deletedMs: number;
  durationMs: number;
}

export function deleteTimelineRange(
  document: ProjectDocument,
  requestedStartMs: number,
  requestedEndMs: number,
  sceneIndex = 0,
  createId: () => string = () => globalThis.crypto.randomUUID(),
): DeletedTimelineRange {
  const currentDurationMs = resolveSceneDurationMs(document, sceneIndex);
  const selected = normalizeDeletionRange(
    requestedStartMs,
    requestedEndMs,
    currentDurationMs,
  );
  if (selected.deletedMs === 0) return selected;

  for (const scene of document.scenes)
    compactScene(document, scene, currentDurationMs, selected);
  document.audio_tracks = (document.audio_tracks ?? []).flatMap((track) =>
    compactAudioTrack(
      track,
      currentDurationMs,
      selected.startMs,
      selected.endMs,
      createId,
    ),
  );
  document.camera_effects = (document.camera_effects ?? []).flatMap(
    (effect) => {
      const range = compactInterval(
        effect.start_ms,
        effect.end_ms,
        selected.startMs,
        selected.endMs,
      );
      return range
        ? [{ ...effect, start_ms: range.startMs, end_ms: range.endMs }]
        : [];
    },
  );
  document.video.duration_ms = selected.durationMs;
  return selected;
}

function normalizeDeletionRange(
  requestedStartMs: number,
  requestedEndMs: number,
  currentDurationMs: number,
): DeletedTimelineRange {
  const startMs = snapTimelineRangeTime(
    Math.min(requestedStartMs, requestedEndMs),
    currentDurationMs,
  );
  const requestedLastMs = snapTimelineRangeTime(
    Math.max(requestedStartMs, requestedEndMs),
    currentDurationMs,
  );
  const deletedMs = Math.min(
    requestedLastMs - startMs,
    currentDurationMs - MIN_VIDEO_DURATION_MS,
  );
  if (deletedMs < VIDEO_DURATION_STEP_MS)
    return {
      startMs,
      endMs: startMs,
      deletedMs: 0,
      durationMs: currentDurationMs,
    };
  return {
    startMs,
    endMs: startMs + deletedMs,
    deletedMs,
    durationMs: currentDurationMs - deletedMs,
  };
}

function compactScene(
  document: ProjectDocument,
  scene: Scene,
  currentDurationMs: number,
  deletion: TimelineInterval,
) {
  const dialogueRanges = resolveDialogueRanges(document, scene);
  scene.layers = scene.layers.flatMap((layer) => {
    const range = compactInterval(
      layer.start_ms ?? 0,
      layer.end_ms ?? currentDurationMs,
      deletion.startMs,
      deletion.endMs,
    );
    return range
      ? [
          {
            ...layer,
            start_ms: range.startMs,
            end_ms: range.endMs,
            keyframes: compactKeyframes(
              layer.keyframes,
              deletion.startMs,
              deletion.endMs,
            ),
          },
        ]
      : [];
  });
  scene.dialogues = scene.dialogues.flatMap((dialogue) => {
    const originalRange = dialogueRanges.get(dialogue.id);
    if (!originalRange) return [dialogue];
    const range = compactInterval(
      originalRange.startMs,
      originalRange.endMs,
      deletion.startMs,
      deletion.endMs,
    );
    if (!range) return [];
    const originalDurationMs = originalRange.endMs - originalRange.startMs;
    const durationMs = range.endMs - range.startMs;
    return [
      {
        ...dialogue,
        start_ms: range.startMs,
        ...(durationMs === originalDurationMs
          ? {}
          : { duration_mode: "manual" as const, duration_ms: durationMs }),
      },
    ];
  });
}

function compactInterval(
  startMs: number,
  endMs: number,
  deletionStartMs: number,
  deletionEndMs: number,
): TimelineInterval | undefined {
  const deletedMs = deletionEndMs - deletionStartMs;
  const compactTime = (timeMs: number) => {
    if (timeMs <= deletionStartMs) return timeMs;
    if (timeMs >= deletionEndMs) return timeMs - deletedMs;
    return deletionStartMs;
  };
  const compacted = {
    startMs: compactTime(startMs),
    endMs: compactTime(endMs),
  };
  return compacted.endMs > compacted.startMs ? compacted : undefined;
}

function compactKeyframes<T extends { time_ms: number }>(
  keyframes: T[] | undefined,
  deletionStartMs: number,
  deletionEndMs: number,
): T[] | undefined {
  if (!keyframes) return undefined;
  const deletedMs = deletionEndMs - deletionStartMs;
  const byTime = new Map<number, T>();
  for (const keyframe of keyframes) {
    if (keyframe.time_ms > deletionStartMs && keyframe.time_ms < deletionEndMs)
      continue;
    const timeMs =
      keyframe.time_ms >= deletionEndMs
        ? keyframe.time_ms - deletedMs
        : keyframe.time_ms;
    byTime.set(timeMs, { ...keyframe, time_ms: timeMs });
  }
  return [...byTime.values()].sort(
    (left, right) => left.time_ms - right.time_ms,
  );
}

function compactAudioTrack(
  track: AudioTrack,
  currentDurationMs: number,
  deletionStartMs: number,
  deletionEndMs: number,
  createId: () => string,
): AudioTrack[] {
  const trackStartMs = track.start_ms;
  const trackEndMs =
    trackStartMs + (track.duration_ms ?? currentDurationMs - trackStartMs);
  const deletedMs = deletionEndMs - deletionStartMs;

  if (trackEndMs <= deletionStartMs) return [track];
  if (trackStartMs >= deletionEndMs)
    return [{ ...track, start_ms: trackStartMs - deletedMs }];
  if (trackStartMs >= deletionStartMs && trackEndMs <= deletionEndMs) return [];
  if (trackStartMs < deletionStartMs && trackEndMs > deletionEndMs)
    return splitAudioTrack(
      track,
      trackEndMs,
      deletionStartMs,
      deletionEndMs,
      createId,
    );
  if (trackStartMs < deletionStartMs) {
    const durationMs = deletionStartMs - trackStartMs;
    return [
      fitAudioFades(
        { ...track, duration_ms: durationMs, fade_out_ms: 0 },
        durationMs,
      ),
    ];
  }

  const skippedSourceMs = deletionEndMs - trackStartMs;
  const durationMs = trackEndMs - deletionEndMs;
  return [
    fitAudioFades(
      {
        ...track,
        start_ms: deletionStartMs,
        duration_ms: durationMs,
        trim_start_ms: track.trim_start_ms + skippedSourceMs,
        fade_in_ms: Math.max(0, track.fade_in_ms - skippedSourceMs),
      },
      durationMs,
    ),
  ];
}

function splitAudioTrack(
  track: AudioTrack,
  trackEndMs: number,
  deletionStartMs: number,
  deletionEndMs: number,
  createId: () => string,
): AudioTrack[] {
  const leftDurationMs = deletionStartMs - track.start_ms;
  const rightDurationMs = trackEndMs - deletionEndMs;
  return [
    fitAudioFades(
      { ...track, duration_ms: leftDurationMs, fade_out_ms: 0 },
      leftDurationMs,
    ),
    fitAudioFades(
      {
        ...track,
        id: createId(),
        start_ms: deletionStartMs,
        duration_ms: rightDurationMs,
        trim_start_ms: track.trim_start_ms + (deletionEndMs - track.start_ms),
        fade_in_ms: 0,
      },
      rightDurationMs,
    ),
  ];
}
