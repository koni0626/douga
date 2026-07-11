import type { ProjectDocument } from "@douga/project-schema";
import {
  ANIMATABLE_LAYER_KEYS,
  captureLayerKeyframe,
  resolveLayerAtTime,
  upsertLayerKeyframe,
  type LayerEasing,
} from "@douga/scene-renderer";

type Layer = ProjectDocument["scenes"][number]["layers"][number];

const ANIMATABLE_KEYS = new Set<string>(ANIMATABLE_LAYER_KEYS);

export function snapKeyframeTime(timeMs: number, durationMs: number) {
  return Math.max(0, Math.min(durationMs - 1, Math.round(timeMs / 50) * 50));
}

export function applyLayerPatchAtTime(
  layer: Layer,
  patch: Partial<Layer>,
  timeMs: number,
  createId: () => string,
) {
  if (layer.locked && patch.locked !== false) return;
  const entries = Object.entries(patch);
  const animatedEntries = entries.filter(([key]) => ANIMATABLE_KEYS.has(key));
  Object.assign(
    layer,
    Object.fromEntries(entries.filter(([key]) => !ANIMATABLE_KEYS.has(key))),
  );
  if (animatedEntries.length === 0) return;
  const animatedPatch = Object.fromEntries(animatedEntries) as Partial<Layer>;
  if (!layer.keyframes?.length) {
    Object.assign(layer, animatedPatch);
    return;
  }
  const resolved = {
    ...resolveLayerAtTime(layer, timeMs),
    ...animatedPatch,
  } as Layer;
  const existing = layer.keyframes.find((item) => item.time_ms === timeMs);
  layer.keyframes = upsertLayerKeyframe(
    layer,
    captureLayerKeyframe(
      resolved,
      timeMs,
      existing?.easing ?? "ease_in_out",
      createId(),
    ),
  );
}

export function recordLayerKeyframe(
  layer: Layer,
  timeMs: number,
  createId: () => string,
) {
  if (layer.locked) return;
  const existing = layer.keyframes?.find((item) => item.time_ms === timeMs);
  layer.keyframes = upsertLayerKeyframe(
    layer,
    captureLayerKeyframe(
      resolveLayerAtTime(layer, timeMs),
      timeMs,
      existing?.easing ?? "ease_in_out",
      createId(),
    ),
  );
}

export function duplicateLayerKeyframe(
  layer: Layer,
  keyframeId: string,
  timeMs: number,
  createId: () => string,
) {
  const source = layer.keyframes?.find((item) => item.id === keyframeId);
  if (!source) return;
  layer.keyframes = upsertLayerKeyframe(layer, {
    ...source,
    id: createId(),
    time_ms: timeMs,
  });
}

export function deleteLayerKeyframe(layer: Layer, keyframeId: string) {
  layer.keyframes = layer.keyframes?.filter((item) => item.id !== keyframeId);
}

export function changeLayerKeyframeEasing(
  layer: Layer,
  keyframeId: string,
  easing: LayerEasing,
) {
  const keyframe = layer.keyframes?.find((item) => item.id === keyframeId);
  if (keyframe) keyframe.easing = easing;
}
