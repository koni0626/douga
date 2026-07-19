import { describe, expect, it } from "vitest";

import type { ProjectDocument } from "@douga/project-schema";

import { cutTimelineAt, resizeTimeline } from "./timelineCut";
import { deleteTimelineRange } from "./timelineRangeDelete";
import { insertTimelineRange } from "./timelineRangeInsert";

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

describe("deleteTimelineRange", () => {
  it("removes the selected interval and shifts every later track", () => {
    const value = project();
    value.scenes[0]!.dialogues = [
      {
        id: "caption-before",
        text: "before",
        start_ms: 0,
        duration_mode: "manual",
        duration_ms: 2000,
        display_effect: "instant",
        manual_page_breaks: [],
      },
      {
        id: "caption-after",
        text: "after",
        start_ms: 7000,
        duration_mode: "manual",
        duration_ms: 1000,
        display_effect: "instant",
        manual_page_breaks: [],
      },
    ];

    const result = deleteTimelineRange(
      value,
      3000,
      6000,
      0,
      () => "split-audio",
    );

    expect(result).toEqual({
      startMs: 3000,
      endMs: 6000,
      deletedMs: 3000,
      durationMs: 7000,
    });
    expect(value.video.duration_ms).toBe(7000);
    expect(value.scenes[0]?.layers[0]).toMatchObject({
      id: "before-cut",
      start_ms: 0,
      end_ms: 7000,
      keyframes: [
        expect.objectContaining({ id: "after-keyframe", time_ms: 6000 }),
      ],
    });
    expect(value.scenes[0]?.layers[1]).toMatchObject({
      id: "after-cut",
      start_ms: 5000,
      end_ms: 7000,
    });
    expect(value.scenes[0]?.dialogues[1]).toMatchObject({
      id: "caption-after",
      start_ms: 4000,
      duration_ms: 1000,
    });
    expect(value.audio_tracks).toEqual([
      expect.objectContaining({
        id: "audio-1",
        start_ms: 1000,
        duration_ms: 2000,
      }),
      expect.objectContaining({
        id: "split-audio",
        start_ms: 3000,
        duration_ms: 4000,
        trim_start_ms: 5000,
      }),
    ]);
    expect(value.camera_effects?.[0]).toMatchObject({
      start_ms: 0,
      end_ms: 7000,
    });
  });

  it("removes clips fully contained in the selected interval", () => {
    const value = project();
    value.scenes[0]!.layers = [
      { ...value.scenes[0]!.layers[1]!, start_ms: 3500, end_ms: 4500 },
    ];
    value.audio_tracks = [
      { ...value.audio_tracks![0]!, start_ms: 3500, duration_ms: 1000 },
    ];
    value.camera_effects = [
      { ...value.camera_effects![0]!, start_ms: 3500, end_ms: 4500 },
    ];

    deleteTimelineRange(value, 3000, 5000, 0, () => "unused");

    expect(value.scenes[0]?.layers).toEqual([]);
    expect(value.audio_tracks).toEqual([]);
    expect(value.camera_effects).toEqual([]);
  });
});

describe("insertTimelineRange", () => {
  it("inserts a blank interval and shifts or splits every affected track", () => {
    const value = project();
    value.scenes[0]!.dialogues = [
      {
        id: "caption-crossing",
        text: "crossing",
        start_ms: 2000,
        duration_mode: "manual",
        duration_ms: 4000,
        display_effect: "instant",
        manual_page_breaks: [],
      },
      {
        id: "caption-after",
        text: "after",
        start_ms: 7000,
        duration_mode: "manual",
        duration_ms: 1000,
        display_effect: "instant",
        manual_page_breaks: [],
      },
    ];
    const ids = ["layer-right", "caption-right", "audio-right", "camera-right"];

    const result = insertTimelineRange(value, 4000, 2000, 0, () =>
      ids.shift()!,
    );

    expect(result).toEqual({
      atMs: 4000,
      insertedMs: 2000,
      durationMs: 12_000,
    });
    expect(value.video.duration_ms).toBe(12_000);
    expect(value.scenes[0]?.layers).toEqual([
      expect.objectContaining({
        id: "before-cut",
        track_id: "before-cut",
        start_ms: 0,
        end_ms: 4000,
        keyframes: [],
      }),
      expect.objectContaining({
        id: "layer-right",
        track_id: "before-cut",
        start_ms: 6000,
        end_ms: 12_000,
        keyframes: [expect.objectContaining({ time_ms: 11_000 })],
      }),
      expect.objectContaining({
        id: "after-cut",
        start_ms: 10_000,
        end_ms: 12_000,
      }),
    ]);
    expect(value.scenes[0]?.dialogues).toEqual([
      expect.objectContaining({
        id: "caption-crossing",
        start_ms: 2000,
        duration_ms: 2000,
      }),
      expect.objectContaining({
        id: "caption-right",
        start_ms: 6000,
        duration_ms: 2000,
      }),
      expect.objectContaining({
        id: "caption-after",
        start_ms: 9000,
        duration_ms: 1000,
      }),
    ]);
    expect(value.audio_tracks).toEqual([
      expect.objectContaining({
        id: "audio-1",
        start_ms: 1000,
        duration_ms: 3000,
      }),
      expect.objectContaining({
        id: "audio-right",
        start_ms: 6000,
        duration_ms: 6000,
        trim_start_ms: 3000,
      }),
    ]);
    expect(value.camera_effects).toEqual([
      expect.objectContaining({ id: "camera-1", start_ms: 0, end_ms: 4000 }),
      expect.objectContaining({
        id: "camera-right",
        start_ms: 6000,
        end_ms: 12_000,
      }),
    ]);
  });

  it("moves clips that start at the insertion point without splitting them", () => {
    const value = project();
    value.scenes[0]!.layers = [
      { ...value.scenes[0]!.layers[1]!, start_ms: 4000, end_ms: 5000 },
    ];

    insertTimelineRange(value, 4000, 1000);

    expect(value.scenes[0]?.layers).toEqual([
      expect.objectContaining({ start_ms: 5000, end_ms: 6000 }),
    ]);
  });
});
