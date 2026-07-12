export interface TimelineRange {
  startMs: number;
  endMs: number;
}

export type TimelineDragMode = "move" | "start" | "end";

export const MIN_TIMELINE_CLIP_DURATION_MS = 250;

export function moveTimelineRange(
  initial: TimelineRange,
  deltaMs: number,
  mode: TimelineDragMode,
  options: { durationMs?: number } = {},
): TimelineRange {
  const durationMs = options.durationMs;
  if (mode === "start") {
    return {
      ...initial,
      startMs: Math.max(
        0,
        Math.min(
          initial.startMs + deltaMs,
          initial.endMs - MIN_TIMELINE_CLIP_DURATION_MS,
        ),
      ),
    };
  }
  if (mode === "end") {
    const endMs = Math.max(
      initial.startMs + MIN_TIMELINE_CLIP_DURATION_MS,
      initial.endMs + deltaMs,
    );
    return {
      ...initial,
      endMs: durationMs === undefined ? endMs : Math.min(durationMs, endMs),
    };
  }
  const length = initial.endMs - initial.startMs;
  const maximumStart =
    durationMs === undefined ? Number.POSITIVE_INFINITY : durationMs - length;
  const startMs = Math.max(
    0,
    Math.min(initial.startMs + deltaMs, maximumStart),
  );
  return { startMs, endMs: startMs + length };
}

export function snapTimelineRange(range: TimelineRange): TimelineRange {
  return {
    startMs: Math.round(range.startMs / 50) * 50,
    endMs: Math.round(range.endMs / 50) * 50,
  };
}

export function formatTimelineTime(timeMs: number): string {
  return `${(timeMs / 1000).toFixed(2)}s`;
}
