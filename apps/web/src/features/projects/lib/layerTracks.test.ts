import { describe, expect, it } from "vitest";

import type { Layer } from "./editorTypes";
import { moveLayerClipToTrack } from "./layerTracks";

describe("layer tracks", () => {
  it("moves one clip to another track while preserving its relative keyframes", () => {
    const layers = [
      {
        id: "source",
        type: "shape",
        shape: "rectangle",
        fill: "#fff",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        opacity: 1,
        start_ms: 1000,
        end_ms: 3000,
        keyframes: [
          {
            id: "frame",
            time_ms: 1500,
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            rotation: 0,
            opacity: 1,
            flip_x: false,
            flip_y: false,
            easing: "linear",
          },
        ],
      },
      {
        id: "target",
        track_id: "target-track",
        type: "shape",
        shape: "rectangle",
        fill: "#000",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        opacity: 1,
        start_ms: 0,
        end_ms: 1000,
      },
    ] satisfies Layer[];

    expect(
      moveLayerClipToTrack(layers, "source", "target", {
        startMs: 4000,
        endMs: 6000,
      }),
    ).toBe(true);
    expect(layers[0]?.track_id).toBe("target-track");
    expect(layers[0]?.start_ms).toBe(4000);
    expect(layers[0]?.end_ms).toBe(6000);
    expect(layers[0]?.keyframes?.[0]?.time_ms).toBe(4500);
  });
});
