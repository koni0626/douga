import type { Layer } from "./editorTypes";
import type { TimelineRange } from "./timelineRange";

export function updateLayerTimelineRange(
  layer: Layer,
  range: TimelineRange,
): void {
  const delta = range.startMs - (layer.start_ms ?? 0);
  layer.start_ms = range.startMs;
  layer.end_ms = range.endMs;
  for (const keyframe of layer.keyframes ?? []) keyframe.time_ms += delta;
}

export function moveLayerClipToTrack(
  layers: Layer[],
  layerId: string,
  targetLayerId: string,
  range: TimelineRange,
): boolean {
  const layer = layers.find((item) => item.id === layerId);
  const target = layers.find((item) => item.id === targetLayerId);
  if (!layer || !target) return false;
  layer.track_id = target.track_id ?? target.id;
  updateLayerTimelineRange(layer, range);
  return true;
}
