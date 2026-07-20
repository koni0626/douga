export function playbackTimeAt(
  startTimeMs: number,
  elapsedMs: number,
  durationMs: number,
) {
  return (startTimeMs + elapsedMs) % durationMs;
}
