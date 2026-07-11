import { describe, expect, it } from "vitest";

import type { Layer } from "./animation";
import {
  captureLayerKeyframe,
  resolveLayerAtTime,
  upsertLayerKeyframe,
} from "./animation";

function shape(): Layer {
  return {
    id: "shape-1",
    type: "shape",
    shape: "rectangle",
    fill: "#000000",
    x: 0,
    y: 20,
    width: 100,
    height: 50,
    rotation: 0,
    opacity: 1,
  };
}

describe("layer keyframes", () => {
  it("interpolates a complete object state", () => {
    const layer = shape();
    layer.keyframes = [
      captureLayerKeyframe(layer, 0, "linear", "start"),
      captureLayerKeyframe(
        { ...layer, x: 100, rotation: 90, opacity: 0, fill: "#ffffff" },
        1000,
        "linear",
        "end",
      ),
    ];

    const resolved = resolveLayerAtTime(layer, 500);

    expect(resolved.x).toBe(50);
    expect(resolved.rotation).toBe(45);
    expect(resolved.opacity).toBe(0.5);
    expect(resolved.type === "shape" ? resolved.fill : undefined).toBe(
      "#808080",
    );
  });

  it("holds a step keyframe until its timestamp", () => {
    const layer = shape();
    layer.keyframes = [
      captureLayerKeyframe(layer, 0, "linear", "start"),
      captureLayerKeyframe({ ...layer, x: 100 }, 1000, "step", "end"),
    ];

    expect(resolveLayerAtTime(layer, 999).x).toBe(0);
    expect(resolveLayerAtTime(layer, 1000).x).toBe(100);
  });

  it("replaces a keyframe recorded at the same time", () => {
    const layer = shape();
    layer.keyframes = [captureLayerKeyframe(layer, 500, "linear", "existing")];
    const keyframes = upsertLayerKeyframe(
      layer,
      captureLayerKeyframe({ ...layer, x: 80 }, 500, "bounce", "replacement"),
    );

    expect(keyframes).toHaveLength(1);
    expect(keyframes[0]).toMatchObject({
      id: "existing",
      x: 80,
      easing: "bounce",
    });
  });
});
