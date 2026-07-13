import { describe, expect, it } from "vitest";

import {
  createTextLayer,
  duplicateTextLayer,
  fitTextLayerToContent,
} from "./textLayers";

describe("createTextLayer", () => {
  it("creates a horizontal text box with compatible style defaults", () => {
    const layer = createTextLayer({
      durationMs: 5000,
      id: "text-1",
      startMs: 1000,
      text: "Text",
      video: { width: 1920, height: 1080, fps: 30 },
      writingMode: "horizontal",
    });

    expect(layer.writing_mode).toBe("horizontal");
    expect(layer.width).toBeGreaterThan(layer.height);
    expect(layer.text_style).toBe("solid");
    expect(layer.neon_color).toBe("#9bdcff");
    expect(layer.start_ms).toBe(1000);
  });

  it("creates a vertical text box that is taller than it is wide", () => {
    const layer = createTextLayer({
      durationMs: 5000,
      id: "text-2",
      startMs: 0,
      text: "縦書き",
      video: { width: 1080, height: 1920, fps: 30 },
      writingMode: "vertical",
    });

    expect(layer.writing_mode).toBe("vertical");
    expect(layer.height).toBeGreaterThan(layer.width);
  });

  it("expands a narrow vertical text box to keep columns after line breaks", () => {
    const layer = createTextLayer({
      durationMs: 5000,
      id: "text-narrow",
      startMs: 0,
      text: "一行目",
      video: { width: 1080, height: 1920, fps: 30 },
      writingMode: "vertical",
    });
    layer.x = 100;
    layer.width = 80;

    const patch = fitTextLayerToContent(layer, "一行目\n二行目");

    expect(patch).toEqual({
      text: "一行目\n二行目",
      width: 160,
      x: 20,
    });
    expect((patch.x ?? layer.x) + (patch.width ?? layer.width)).toBe(
      layer.x + layer.width,
    );
  });

  it("duplicates a text box at the exact same canvas position on a new track", () => {
    const source = createTextLayer({
      durationMs: 5000,
      id: "text-source",
      startMs: 1000,
      text: "Copy me",
      video: { width: 1920, height: 1080, fps: 30 },
      writingMode: "vertical",
    });
    source.track_id = "shared-track";
    source.rotation = 17;
    source.text_style = "neon";
    source.keyframes = [
      {
        id: "keyframe-source",
        time_ms: 1500,
        easing: "linear",
        x: source.x,
        y: source.y,
        width: source.width,
        height: source.height,
        rotation: source.rotation,
        opacity: source.opacity,
        flip_x: false,
        flip_y: false,
        color: source.color,
        font_size: source.font_size,
      },
    ];

    const copy = duplicateTextLayer(source, "text-copy", () => "keyframe-copy");

    expect(copy).toMatchObject({
      id: "text-copy",
      track_id: undefined,
      x: source.x,
      y: source.y,
      width: source.width,
      height: source.height,
      rotation: 17,
      text_style: "neon",
      writing_mode: "vertical",
    });
    expect(copy.keyframes?.[0]?.id).toBe("keyframe-copy");
    expect(copy.keyframes?.[0]?.x).toBe(source.keyframes[0]?.x);
  });
});
