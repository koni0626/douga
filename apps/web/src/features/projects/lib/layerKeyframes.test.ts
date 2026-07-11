import { describe, expect, it } from "vitest";

import type { ProjectDocument } from "@douga/project-schema";

import {
  applyLayerAnimationPreset,
  applyLayerPatchAtTime,
  type LayerAnimationPreset,
} from "./layerKeyframes";

type Layer = ProjectDocument["scenes"][number]["layers"][number];

const PRESETS: LayerAnimationPreset[] = [
  "slide_left",
  "slide_right",
  "slide_up",
  "slide_down",
  "zoom_in",
  "pop",
  "bounce",
  "shake",
  "spin",
  "pulse",
  "float",
  "fade_in",
  "fade_out",
  "blink",
  "flash",
];

function shape(): Layer {
  return {
    id: "shape-1",
    type: "shape",
    shape: "rectangle",
    fill: "#000000",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
  };
}

describe("layer keyframe editing", () => {
  it("automatically records animated changes after animation starts", () => {
    const layer = shape();
    let sequence = 0;
    const createId = () => `keyframe-${++sequence}`;

    applyLayerAnimationPreset(
      layer,
      "fade_in",
      1000,
      600,
      { width: 1920, height: 1080, durationMs: 5000 },
      createId,
    );
    applyLayerPatchAtTime(layer, { x: 300, rotation: 90 }, 4000, createId);

    expect(layer.keyframes).toHaveLength(3);
    expect(layer.keyframes?.[2]).toMatchObject({
      time_ms: 4000,
      x: 300,
      rotation: 90,
    });
  });

  it("creates preset keyframes around the playhead", () => {
    const layer = shape();
    let sequence = 0;

    applyLayerAnimationPreset(
      layer,
      "slide_left",
      2000,
      600,
      { width: 1920, height: 1080, durationMs: 5000 },
      () => `keyframe-${++sequence}`,
    );

    expect(layer.keyframes).toHaveLength(2);
    expect(layer.keyframes?.[0]).toMatchObject({ time_ms: 1400, x: -100 });
    expect(layer.keyframes?.[1]).toMatchObject({ time_ms: 2000, x: 0 });
  });

  it("keeps normal editing when animation has not started", () => {
    const layer = shape();

    applyLayerPatchAtTime(layer, { x: 200 }, 3000, () => "unused");

    expect(layer.x).toBe(200);
    expect(layer.keyframes).toBeUndefined();
  });

  it.each(PRESETS)("creates valid %s preset frames", (preset) => {
    const layer = shape();
    let sequence = 0;

    applyLayerAnimationPreset(
      layer,
      preset,
      0,
      600,
      { width: 1920, height: 1080, durationMs: 5000 },
      () => `keyframe-${++sequence}`,
    );

    expect(layer.keyframes?.length).toBeGreaterThanOrEqual(2);
    expect(
      layer.keyframes?.every(
        (keyframe) =>
          keyframe.time_ms >= 0 &&
          keyframe.time_ms < 5000 &&
          Number.isFinite(keyframe.x) &&
          Number.isFinite(keyframe.opacity),
      ),
    ).toBe(true);
  });
});
