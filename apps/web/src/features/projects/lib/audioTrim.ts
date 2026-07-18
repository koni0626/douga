export const MIN_AUDIO_CLIP_DURATION_MS = 50;

export interface AudioTrimRange {
  durationMs: number;
  trimStartMs: number;
}

export interface AudioClipRange extends AudioTrimRange {
  startMs: number;
}

export function moveAudioClip(
  startMs: number,
  durationMs: number,
  requestedDeltaMs: number,
  timelineDurationMs: number,
): number {
  return snapAudioTime(
    Math.max(
      0,
      Math.min(
        Math.max(0, timelineDurationMs - MIN_AUDIO_CLIP_DURATION_MS),
        startMs + requestedDeltaMs,
      ),
    ),
  );
}

export function trimAudioClipStart(
  range: AudioClipRange,
  requestedDeltaMs: number,
): AudioClipRange {
  const deltaMs = Math.max(
    -Math.min(range.startMs, range.trimStartMs),
    Math.min(
      range.durationMs - MIN_AUDIO_CLIP_DURATION_MS,
      snapAudioTime(requestedDeltaMs),
    ),
  );
  return {
    startMs: range.startMs + deltaMs,
    trimStartMs: range.trimStartMs + deltaMs,
    durationMs: range.durationMs - deltaMs,
  };
}

export function trimAudioClipEnd(
  range: AudioClipRange,
  sourceDurationMs: number | undefined,
  requestedDeltaMs: number,
): AudioClipRange {
  const trimmed = clampAudioTrimRange(
    sourceDurationMs,
    range.trimStartMs,
    range.durationMs + snapAudioTime(requestedDeltaMs),
  );
  return { ...range, ...trimmed };
}

export function snapAudioTime(valueMs: number): number {
  return Math.round(valueMs / 50) * 50;
}

export function clampAudioTrimRange(
  sourceDurationMs: number | undefined,
  requestedTrimStartMs: number,
  requestedDurationMs: number,
): AudioTrimRange {
  const finiteSourceDuration =
    sourceDurationMs !== undefined && Number.isFinite(sourceDurationMs)
      ? Math.max(MIN_AUDIO_CLIP_DURATION_MS, Math.round(sourceDurationMs))
      : undefined;
  const maximumTrimStart = finiteSourceDuration
    ? finiteSourceDuration - MIN_AUDIO_CLIP_DURATION_MS
    : Number.POSITIVE_INFINITY;
  const trimStartMs = Math.min(
    maximumTrimStart,
    Math.max(0, Math.round(requestedTrimStartMs)),
  );
  const maximumDuration = finiteSourceDuration
    ? finiteSourceDuration - trimStartMs
    : Number.POSITIVE_INFINITY;
  const durationMs = Math.min(
    maximumDuration,
    Math.max(MIN_AUDIO_CLIP_DURATION_MS, Math.round(requestedDurationMs)),
  );
  return { durationMs, trimStartMs };
}
