import type { ProjectDocument } from "@douga/project-schema";
import {
  buildSceneTimeline,
  MAX_VIDEO_DURATION_MS,
  MIN_VIDEO_DURATION_MS,
  resolveSceneDurationMs,
  VIDEO_DURATION_STEP_MS,
} from "@douga/scene-renderer";

export const TIMELINE_DURATION_RESIZE_STEP_MS = 1000;

export function resizeTimeline(
  document: ProjectDocument,
  requestedDurationMs: number,
  sceneIndex = 0,
): number {
  const durationMs = snapTimelineResizeDuration(requestedDurationMs);
  if (durationMs < resolveSceneDurationMs(document, sceneIndex))
    return cutTimelineAt(document, durationMs);
  document.video.duration_ms = durationMs;
  return durationMs;
}

export function cutTimelineAt(
  document: ProjectDocument,
  requestedTimeMs: number,
): number {
  const cutMs = snapTimelineCutDuration(requestedTimeMs);

  for (const scene of document.scenes) {
    const dialogueRanges = new Map<
      string,
      { startMs: number; endMs: number }
    >();
    for (const page of buildSceneTimeline(
      scene,
      document.caption_style,
      document.content_locale,
    )) {
      const range = dialogueRanges.get(page.dialogueId);
      if (range) {
        range.startMs = Math.min(range.startMs, page.startMs);
        range.endMs = Math.max(range.endMs, page.endMs);
      } else {
        dialogueRanges.set(page.dialogueId, {
          startMs: page.startMs,
          endMs: page.endMs,
        });
      }
    }

    scene.layers = scene.layers
      .filter((layer) => (layer.start_ms ?? 0) < cutMs)
      .map((layer) => ({
        ...layer,
        end_ms: Math.min(layer.end_ms ?? cutMs, cutMs),
        keyframes: layer.keyframes?.filter(
          (keyframe) => keyframe.time_ms <= cutMs,
        ),
      }));

    scene.dialogues = scene.dialogues
      .filter((dialogue) => {
        const range = dialogueRanges.get(dialogue.id);
        return (range?.startMs ?? dialogue.start_ms ?? 0) < cutMs;
      })
      .map((dialogue) => {
        const range = dialogueRanges.get(dialogue.id);
        if (!range || range.endMs <= cutMs) return dialogue;
        return {
          ...dialogue,
          start_ms: range.startMs,
          duration_mode: "manual" as const,
          duration_ms: Math.max(1, cutMs - range.startMs),
        };
      });
  }

  document.audio_tracks = (document.audio_tracks ?? [])
    .filter((track) => track.start_ms < cutMs)
    .map((track) => {
      const durationMs = Math.max(
        1,
        Math.min(
          track.duration_ms ?? cutMs - track.start_ms,
          cutMs - track.start_ms,
        ),
      );
      const fadeInMs = Math.min(track.fade_in_ms, durationMs);
      return {
        ...track,
        duration_ms: durationMs,
        fade_in_ms: fadeInMs,
        fade_out_ms: Math.min(track.fade_out_ms, durationMs - fadeInMs),
      };
    });
  document.camera_effects = (document.camera_effects ?? [])
    .filter((effect) => effect.start_ms < cutMs)
    .map((effect) => ({ ...effect, end_ms: Math.min(effect.end_ms, cutMs) }));
  document.video.duration_ms = cutMs;
  return cutMs;
}

function snapTimelineCutDuration(requestedDurationMs: number): number {
  return Math.max(
    MIN_VIDEO_DURATION_MS,
    Math.min(
      MAX_VIDEO_DURATION_MS,
      Math.round(requestedDurationMs / VIDEO_DURATION_STEP_MS) *
        VIDEO_DURATION_STEP_MS,
    ),
  );
}

function snapTimelineResizeDuration(requestedDurationMs: number): number {
  return Math.max(
    1000,
    Math.min(
      MAX_VIDEO_DURATION_MS,
      Math.round(requestedDurationMs / TIMELINE_DURATION_RESIZE_STEP_MS) *
        TIMELINE_DURATION_RESIZE_STEP_MS,
    ),
  );
}
