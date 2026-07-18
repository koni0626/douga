import { describe, expect, it } from "vitest";

import type { ProjectDocument } from "@douga/project-schema";

import { cutTimelineAt, resizeTimeline } from "./timelineCut";

function project(): ProjectDocument {
  return {
    schema_version: 1,
    project_id: "project-1",
    name: "Cut",
    content_locale: "ja",
    video: { width: 1920, height: 1080, fps: 30, duration_ms: 10_000 },
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
        layers: [
          {
            id: "before-cut",
            type: "shape",
            shape: "rectangle",
            fill: "#ffffff",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            rotation: 0,
            opacity: 1,
            start_ms: 0,
            end_ms: 10_000,
            keyframes: [
              {
                id: "after-keyframe",
                time_ms: 9000,
                easing: "linear",
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                rotation: 0,
                opacity: 1,
                flip_x: false,
                flip_y: false,
              },
            ],
          },
          {
            id: "after-cut",
            type: "shape",
            shape: "rectangle",
            fill: "#ffffff",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            rotation: 0,
            opacity: 1,
            start_ms: 8000,
            end_ms: 10_000,
          },
        ],
        dialogues: [],
      },
    ],
    audio_tracks: [
      {
        id: "audio-1",
        asset_id: "asset-1",
        role: "bgm",
        start_ms: 1000,
        duration_ms: 9000,
        trim_start_ms: 0,
        volume: 1,
        loop: false,
        fade_in_ms: 1000,
        fade_out_ms: 3000,
        ducking: false,
      },
    ],
    camera_effects: [
      {
        id: "camera-1",
        preset: "breathe",
        start_ms: 0,
        end_ms: 10_000,
        intensity: 1,
        period_ms: 1000,
      },
    ],
  };
}

describe("cutTimelineAt", () => {
  it("cuts every track at the selected time without five-second rounding", () => {
    const value = project();

    expect(cutTimelineAt(value, 6251)).toBe(6250);
    expect(value.video.duration_ms).toBe(6250);
    expect(value.scenes[0]?.layers).toHaveLength(1);
    expect(value.scenes[0]?.layers[0]).toMatchObject({
      id: "before-cut",
      end_ms: 6250,
      keyframes: [],
    });
    expect(value.audio_tracks?.[0]).toMatchObject({
      duration_ms: 5250,
      fade_in_ms: 1000,
      fade_out_ms: 3000,
    });
    expect(value.camera_effects?.[0]?.end_ms).toBe(6250);
  });

  it("extends to an arbitrary duration without changing existing clips", () => {
    const value = project();

    expect(resizeTimeline(value, 12_341)).toBe(12_000);
    expect(value.video.duration_ms).toBe(12_000);
    expect(value.scenes[0]?.layers).toHaveLength(2);
  });

  it("uses the same cut behavior when the end handle is dragged left", () => {
    const value = project();

    expect(resizeTimeline(value, 6251)).toBe(6000);
    expect(value.video.duration_ms).toBe(6000);
    expect(value.scenes[0]?.layers).toHaveLength(1);
  });
});
