import { describe, expect, it } from "vitest";

import type { ProjectDocument } from "@douga/project-schema";

import { resolveSceneDurationMs, roundVideoDurationMs } from "./duration";

function project(): ProjectDocument {
  return {
    schema_version: 1,
    project_id: "project-1",
    name: "Duration",
    content_locale: "ja",
    video: { width: 1920, height: 1080, fps: 30 },
    caption_style: {
      x: 0,
      y: 0,
      width: 1000,
      height: 200,
      padding: 20,
      font_family: "sans-serif",
      font_size: 40,
      line_height: 1.3,
      max_lines: 2,
      text_color: "#ffffff",
      background_color: "#000000",
      background_opacity: 0.8,
      border_radius: 0,
      text_align: "left",
    },
    scenes: [
      {
        id: "canvas",
        name: "Canvas",
        background: { type: "color", color: "#000000" },
        layers: [],
        dialogues: [],
      },
    ],
  };
}

describe("resolveSceneDurationMs", () => {
  it("uses five seconds as the minimum and rounds up", () => {
    expect(roundVideoDurationMs(0)).toBe(5000);
    expect(roundVideoDurationMs(12_001)).toBe(15_000);
  });

  it("extends to the latest layer and keyframe", () => {
    const value = project();
    value.scenes[0]?.layers.push({
      id: "shape-1",
      type: "shape",
      shape: "rectangle",
      fill: "#ffffff",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      end_ms: 7200,
      keyframes: [
        {
          id: "keyframe-1",
          time_ms: 12_100,
          easing: "linear",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotation: 0,
          opacity: 1,
          flip_x: false,
          flip_y: false,
          fill: "#ffffff",
        },
      ],
    });

    expect(resolveSceneDurationMs(value)).toBe(15_000);
  });

  it("includes manual duration and audio", () => {
    const value = project();
    value.video.duration_ms = 11_000;
    value.audio_tracks = [
      {
        id: "audio-1",
        asset_id: "asset-1",
        role: "bgm",
        start_ms: 2000,
        duration_ms: 14_000,
        trim_start_ms: 0,
        volume: 1,
        loop: false,
        fade_in_ms: 0,
        fade_out_ms: 0,
        ducking: false,
      },
    ];

    expect(resolveSceneDurationMs(value)).toBe(20_000);
  });

  it("includes camera effects", () => {
    const value = project();
    value.camera_effects = [
      {
        id: "camera-1",
        preset: "breathe",
        start_ms: 0,
        end_ms: 12_001,
        intensity: 1,
        period_ms: 4000,
      },
    ];

    expect(resolveSceneDurationMs(value)).toBe(15_000);
  });
});
