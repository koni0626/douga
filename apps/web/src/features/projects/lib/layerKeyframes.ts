import type { ProjectDocument } from "@douga/project-schema";
import {
  ANIMATABLE_LAYER_KEYS,
  captureLayerKeyframe,
  resolveLayerAtTime,
  upsertLayerKeyframe,
  type LayerEasing,
} from "@douga/scene-renderer";

type Layer = ProjectDocument["scenes"][number]["layers"][number];

export type LayerAnimationPreset =
  | "slide_left"
  | "slide_right"
  | "slide_up"
  | "slide_down"
  | "zoom_in"
  | "pop"
  | "bounce"
  | "shake"
  | "spin"
  | "pulse"
  | "float"
  | "fade_in"
  | "fade_out"
  | "blink"
  | "flash";

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

function scaledLayer(layer: Layer, scale: number): Layer {
  const width = layer.width * scale;
  const height = layer.height * scale;
  return {
    ...layer,
    x: layer.x + (layer.width - width) / 2,
    y: layer.y + (layer.height - height) / 2,
    width,
    height,
  };
}

function presetFrames(
  layer: Layer,
  preset: LayerAnimationPreset,
  timeMs: number,
  durationMs: number,
  canvas: { width: number; height: number; durationMs: number },
): Array<{ easing: LayerEasing; layer: Layer; timeMs: number }> {
  const layerStart = layer.start_ms ?? 0;
  const entranceEnd =
    timeMs <= layerStart
      ? Math.min(canvas.durationMs - 1, layerStart + durationMs)
      : timeMs;
  const start = Math.max(layerStart, entranceEnd - durationMs);
  const end = Math.min(
    layer.end_ms ?? canvas.durationMs,
    canvas.durationMs - 1,
    timeMs + durationMs,
  );
  const enter = (from: Layer, middle?: Layer) => [
    { layer: from, timeMs: start, easing: "linear" as const },
    ...(middle
      ? [
          {
            layer: middle,
            timeMs: start + (entranceEnd - start) * 0.72,
            easing: "ease_out" as const,
          },
        ]
      : []),
    { layer, timeMs: entranceEnd, easing: "ease_out" as const },
  ];
  if (preset === "slide_left") return enter({ ...layer, x: -layer.width });
  if (preset === "slide_right") return enter({ ...layer, x: canvas.width });
  if (preset === "slide_up") return enter({ ...layer, y: -layer.height });
  if (preset === "slide_down") return enter({ ...layer, y: canvas.height });
  if (preset === "zoom_in") return enter(scaledLayer(layer, 0.12));
  if (preset === "pop")
    return enter(scaledLayer(layer, 0.55), scaledLayer(layer, 1.12));
  if (preset === "fade_in") return enter({ ...layer, opacity: 0 });
  if (preset === "fade_out")
    return [
      { layer, timeMs, easing: "linear" },
      { layer: { ...layer, opacity: 0 }, timeMs: end, easing: "ease_in_out" },
    ];

  const at = (progress: number) => timeMs + (end - timeMs) * progress;
  if (preset === "bounce")
    return [
      { layer, timeMs, easing: "linear" },
      {
        layer: { ...layer, y: layer.y - layer.height * 0.18 },
        timeMs: at(0.45),
        easing: "ease_out",
      },
      { layer, timeMs: end, easing: "bounce" },
    ];
  if (preset === "shake")
    return [
      { layer, timeMs, easing: "linear" },
      {
        layer: { ...layer, x: layer.x - layer.width * 0.06 },
        timeMs: at(0.25),
        easing: "linear",
      },
      {
        layer: { ...layer, x: layer.x + layer.width * 0.06 },
        timeMs: at(0.5),
        easing: "linear",
      },
      {
        layer: { ...layer, x: layer.x - layer.width * 0.03 },
        timeMs: at(0.75),
        easing: "linear",
      },
      { layer, timeMs: end, easing: "ease_out" },
    ];
  if (preset === "spin")
    return [
      { layer, timeMs, easing: "linear" },
      {
        layer: { ...layer, rotation: layer.rotation + 360 },
        timeMs: end,
        easing: "linear",
      },
    ];
  if (preset === "pulse")
    return [
      { layer, timeMs, easing: "linear" },
      { layer: scaledLayer(layer, 1.15), timeMs: at(0.5), easing: "ease_out" },
      { layer, timeMs: end, easing: "ease_in_out" },
    ];
  if (preset === "float")
    return [
      { layer, timeMs, easing: "linear" },
      {
        layer: { ...layer, y: layer.y - layer.height * 0.08 },
        timeMs: at(0.5),
        easing: "ease_in_out",
      },
      { layer, timeMs: end, easing: "ease_in_out" },
    ];
  if (preset === "blink")
    return [0, 0.25, 0.5, 0.75, 1].map((progress, index) => ({
      layer: { ...layer, opacity: index % 2 === 0 ? layer.opacity : 0 },
      timeMs: at(progress),
      easing: "step" as const,
    }));
  return [
    { layer, timeMs, easing: "linear" },
    { layer: { ...layer, opacity: 0.2 }, timeMs: at(0.35), easing: "ease_out" },
    { layer, timeMs: end, easing: "ease_in" },
  ];
}

export function applyLayerAnimationPreset(
  layer: Layer,
  preset: LayerAnimationPreset,
  timeMs: number,
  durationMs: number,
  canvas: { width: number; height: number; durationMs: number },
  createId: () => string,
) {
  if (layer.locked) return;
  const resolved = resolveLayerAtTime(layer, timeMs);
  for (const frame of presetFrames(
    resolved,
    preset,
    timeMs,
    durationMs,
    canvas,
  )) {
    const snappedTime = snapKeyframeTime(frame.timeMs, canvas.durationMs);
    layer.keyframes = upsertLayerKeyframe(
      layer,
      captureLayerKeyframe(frame.layer, snappedTime, frame.easing, createId()),
    );
  }
}

export function clearLayerAnimation(layer: Layer) {
  layer.keyframes = [];
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
