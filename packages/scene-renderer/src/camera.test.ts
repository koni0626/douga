import { describe, expect, it } from "vitest";

import { resolveCameraTransform, type CameraEffect } from "./camera";

const effect: CameraEffect = {
  id: "camera-1",
  preset: "sway",
  start_ms: 1000,
  end_ms: 5000,
  intensity: 1,
  period_ms: 2000,
};

describe("camera animation", () => {
  it("does not affect frames outside its range", () => {
    expect(resolveCameraTransform([effect], 500)).toEqual({
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
    });
  });

  it("loops within the selected range", () => {
    expect(resolveCameraTransform([effect], 1500)).toEqual(
      resolveCameraTransform([effect], 3500),
    );
  });
});
