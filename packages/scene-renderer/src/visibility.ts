import type { Layer } from "./animation";

export function isLayerVisibleAtTime(layer: Layer, timeMs: number): boolean {
  return (
    timeMs >= (layer.start_ms ?? 0) &&
    timeMs < (layer.end_ms ?? Number.POSITIVE_INFINITY)
  );
}
