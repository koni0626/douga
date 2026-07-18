export const TIMELINE_LABEL_WIDTH_PX = 144;
export const TIMELINE_SECOND_WIDTH_PX = 48;
export const TIMELINE_MIN_TRACK_WIDTH_PX = 480;

export function timelineTrackWidth(durationMs: number): number {
  return Math.max(
    TIMELINE_MIN_TRACK_WIDTH_PX,
    (durationMs / 1000) * TIMELINE_SECOND_WIDTH_PX,
  );
}

export function timelineSecondWidth(durationMs: number): number {
  return timelineTrackWidth(durationMs) / Math.max(0.001, durationMs / 1000);
}

export function followPlayheadScroll(
  scrollLeft: number,
  viewportWidth: number,
  playheadContentX: number,
): number {
  const visibleStart = scrollLeft + TIMELINE_LABEL_WIDTH_PX;
  const visibleEnd = scrollLeft + viewportWidth - 24;
  if (playheadContentX < visibleStart)
    return Math.max(0, playheadContentX - TIMELINE_LABEL_WIDTH_PX);
  if (playheadContentX > visibleEnd)
    return Math.max(0, playheadContentX - viewportWidth * 0.7);
  return scrollLeft;
}
