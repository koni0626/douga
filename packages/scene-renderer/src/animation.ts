import type { ProjectDocument } from "@douga/project-schema";

export type Layer = ProjectDocument["scenes"][number]["layers"][number];
export type LayerKeyframe = NonNullable<Layer["keyframes"]>[number];
export type LayerEasing = LayerKeyframe["easing"];

const NUMBER_KEYS = [
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "opacity",
  "font_size",
] as const;

export const ANIMATABLE_LAYER_KEYS = [
  ...NUMBER_KEYS,
  "flip_x",
  "flip_y",
  "fill",
  "color",
] as const;

export type AnimatableLayerKey = (typeof ANIMATABLE_LAYER_KEYS)[number];

export function captureLayerKeyframe(
  layer: Layer,
  timeMs: number,
  easing: LayerEasing = "ease_in_out",
  id = `${layer.id}-${timeMs}`,
): LayerKeyframe {
  const keyframe: LayerKeyframe = {
    id,
    time_ms: Math.max(0, Math.round(timeMs)),
    easing,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    rotation: layer.rotation,
    opacity: layer.opacity,
    flip_x: layer.flip_x ?? false,
    flip_y: layer.flip_y ?? false,
  };
  if (layer.type === "shape") keyframe.fill = layer.fill;
  if (layer.type === "text") {
    keyframe.color = layer.color;
    keyframe.font_size = layer.font_size;
  }
  return keyframe;
}

export function upsertLayerKeyframe(
  layer: Layer,
  keyframe: LayerKeyframe,
): LayerKeyframe[] {
  const current = layer.keyframes ?? [];
  const existing = current.find((item) => item.time_ms === keyframe.time_ms);
  return [
    ...current.filter((item) => item.time_ms !== keyframe.time_ms),
    existing ? { ...keyframe, id: existing.id } : keyframe,
  ].sort((left, right) => left.time_ms - right.time_ms);
}

function easingProgress(easing: LayerEasing, progress: number): number {
  const value = Math.max(0, Math.min(1, progress));
  if (easing === "linear") return value;
  if (easing === "ease_in") return value ** 3;
  if (easing === "ease_out") return 1 - (1 - value) ** 3;
  if (easing === "step") return value < 1 ? 0 : 1;
  if (easing === "bounce") {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (value < 1 / d1) return n1 * value * value;
    if (value < 2 / d1) {
      const shifted = value - 1.5 / d1;
      return n1 * shifted * shifted + 0.75;
    }
    if (value < 2.5 / d1) {
      const shifted = value - 2.25 / d1;
      return n1 * shifted * shifted + 0.9375;
    }
    const shifted = value - 2.625 / d1;
    return n1 * shifted * shifted + 0.984375;
  }
  return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
}

function interpolateNumber(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

function parseHexColor(value: string): [number, number, number] | undefined {
  const normalized = value.match(/^#([\da-f]{3}|[\da-f]{6})$/iu)?.[1];
  if (!normalized) return undefined;
  const hex =
    normalized.length === 3
      ? [...normalized].map((part) => part + part).join("")
      : normalized;
  return [0, 2, 4].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16),
  ) as [number, number, number];
}

function interpolateColor(from: string, to: string, progress: number): string {
  const fromRgb = parseHexColor(from);
  const toRgb = parseHexColor(to);
  if (!fromRgb || !toRgb) return progress < 1 ? from : to;
  return `#${fromRgb
    .map((channel, index) =>
      Math.round(interpolateNumber(channel, toRgb[index] ?? channel, progress))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function applyKeyframe(layer: Layer, keyframe: LayerKeyframe): Layer {
  const next = {
    ...layer,
    x: keyframe.x,
    y: keyframe.y,
    width: keyframe.width,
    height: keyframe.height,
    rotation: keyframe.rotation,
    opacity: keyframe.opacity,
    flip_x: keyframe.flip_x,
    flip_y: keyframe.flip_y,
  };
  if (next.type === "shape" && keyframe.fill) next.fill = keyframe.fill;
  if (next.type === "text") {
    if (keyframe.color) next.color = keyframe.color;
    if (keyframe.font_size) next.font_size = keyframe.font_size;
  }
  return next;
}

export function resolveLayerAtTime(layer: Layer, timeMs: number): Layer {
  const keyframes = [...(layer.keyframes ?? [])].sort(
    (left, right) => left.time_ms - right.time_ms,
  );
  if (keyframes.length === 0) return layer;
  const first = keyframes[0];
  const last = keyframes.at(-1);
  if (!first || !last) return layer;
  if (timeMs <= first.time_ms) return applyKeyframe(layer, first);
  if (timeMs >= last.time_ms) return applyKeyframe(layer, last);

  const nextIndex = keyframes.findIndex(
    (keyframe) => keyframe.time_ms >= timeMs,
  );
  const next = keyframes[nextIndex];
  const previous = keyframes[nextIndex - 1];
  if (!previous || !next) return layer;
  const duration = next.time_ms - previous.time_ms;
  const progress = easingProgress(
    next.easing,
    duration === 0 ? 1 : (timeMs - previous.time_ms) / duration,
  );
  const resolved = applyKeyframe(layer, previous) as Layer &
    Record<string, number | string | boolean | undefined>;

  for (const key of NUMBER_KEYS) {
    const from = previous[key];
    const to = next[key];
    if (typeof from === "number" && typeof to === "number") {
      resolved[key] = interpolateNumber(from, to, progress);
    }
  }
  resolved.flip_x = progress < 1 ? previous.flip_x : next.flip_x;
  resolved.flip_y = progress < 1 ? previous.flip_y : next.flip_y;
  if (previous.fill && next.fill)
    resolved.fill = interpolateColor(previous.fill, next.fill, progress);
  if (previous.color && next.color)
    resolved.color = interpolateColor(previous.color, next.color, progress);
  return resolved as Layer;
}
