import type { ProjectDocument } from "@douga/project-schema";
import {
  buildSceneTimeline,
  VIDEO_DURATION_STEP_MS,
} from "@douga/scene-renderer";

export type TimelineInterval = { startMs: number; endMs: number };
type Scene = ProjectDocument["scenes"][number];

export function resolveDialogueRanges(
  document: ProjectDocument,
  scene: Scene,
): Map<string, TimelineInterval> {
  const ranges = new Map<string, TimelineInterval>();
  for (const page of buildSceneTimeline(
    scene,
    document.caption_style,
    document.content_locale,
  )) {
    const range = ranges.get(page.dialogueId);
    if (range) {
      range.startMs = Math.min(range.startMs, page.startMs);
      range.endMs = Math.max(range.endMs, page.endMs);
    } else {
      ranges.set(page.dialogueId, {
        startMs: page.startMs,
        endMs: page.endMs,
      });
    }
  }
  return ranges;
}

export function snapTimelineRangeTime(timeMs: number, maximumMs: number) {
  return Math.max(
    0,
    Math.min(
      maximumMs,
      Math.round(timeMs / VIDEO_DURATION_STEP_MS) * VIDEO_DURATION_STEP_MS,
    ),
  );
}

export function fitAudioFades<
  T extends { fade_in_ms: number; fade_out_ms: number },
>(track: T, durationMs: number): T {
  const fadeInMs = Math.min(track.fade_in_ms, durationMs);
  return {
    ...track,
    fade_in_ms: fadeInMs,
    fade_out_ms: Math.min(track.fade_out_ms, durationMs - fadeInMs),
  };
}
