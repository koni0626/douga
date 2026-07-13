import { describe, expect, it } from "vitest";

import type { Layer } from "./animation";
import { isLayerVisibleAtTime } from "./visibility";

const layer: Layer = {
  id: "image-a",
  type: "image",
  asset_id: "asset-a",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  opacity: 1,
  start_ms: 1000,
  end_ms: 3000,
};

describe("isLayerVisibleAtTime", () => {
  it("uses an inclusive start and exclusive end", () => {
    expect(isLayerVisibleAtTime(layer, 999)).toBe(false);
    expect(isLayerVisibleAtTime(layer, 1000)).toBe(true);
    expect(isLayerVisibleAtTime(layer, 2999)).toBe(true);
    expect(isLayerVisibleAtTime(layer, 3000)).toBe(false);
  });

  it("keeps layers without an explicit range visible", () => {
    const persistent = { ...layer, start_ms: undefined, end_ms: undefined };

    expect(isLayerVisibleAtTime(persistent, 0)).toBe(true);
    expect(isLayerVisibleAtTime(persistent, 10_000)).toBe(true);
  });
});
