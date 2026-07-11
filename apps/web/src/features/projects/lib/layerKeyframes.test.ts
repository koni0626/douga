import { describe, expect, it } from "vitest";

import type { ProjectDocument } from "@douga/project-schema";

import { applyLayerPatchAtTime, recordLayerKeyframe } from "./layerKeyframes";

type Layer = ProjectDocument["scenes"][number]["layers"][number];

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

    recordLayerKeyframe(layer, 1000, createId);
    applyLayerPatchAtTime(layer, { x: 300, rotation: 90 }, 4000, createId);

    expect(layer.keyframes).toHaveLength(2);
    expect(layer.keyframes?.[1]).toMatchObject({
      time_ms: 4000,
      x: 300,
      rotation: 90,
    });
  });

  it("keeps normal editing when animation has not started", () => {
    const layer = shape();

    applyLayerPatchAtTime(layer, { x: 200 }, 3000, () => "unused");

    expect(layer.x).toBe(200);
    expect(layer.keyframes).toBeUndefined();
  });
});
