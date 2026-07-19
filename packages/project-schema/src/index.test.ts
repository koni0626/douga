import { describe, expect, it } from "vitest";

import type { ProjectDocument } from "./generated/project-v1";
import { validateProjectDocument } from "./index";

function validProject(): ProjectDocument {
  return {
    schema_version: 1,
    project_id: "project-1",
    name: "Sample",
    content_locale: "ja",
    video: { width: 1920, height: 1080, fps: 30 },
    caption_style: {
      x: 140,
      y: 760,
      width: 1640,
      height: 240,
      padding: 40,
      font_family: "sans-serif",
      font_size: 56,
      line_height: 1.35,
      max_lines: 2,
      text_color: "#ffffff",
      background_color: "#000000",
      background_opacity: 0.75,
      border_radius: 24,
      text_align: "left",
    },
    scenes: [],
  };
}

describe("validateProjectDocument", () => {
  it("accepts a minimal valid project", () => {
    const project = validProject();
    project.camera_effects = [
      {
        id: "camera-1",
        preset: "handheld",
        start_ms: 0,
        end_ms: 5000,
        intensity: 1,
        period_ms: 900,
      },
    ];
    expect(validateProjectDocument(project)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("accepts a sub-five-second project duration", () => {
    const project = validProject();
    project.video.duration_ms = 2350;

    expect(validateProjectDocument(project)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("accepts layer keyframes", () => {
    const project = validProject();
    project.video.duration_ms = 15_000;
    project.scenes.push({
      id: "canvas",
      name: "Canvas",
      background: { type: "color", color: "#000000" },
      dialogues: [],
      layers: [
        {
          id: "shape-1",
          track_id: "visual-track",
          name: "Title card",
          type: "shape",
          shape: "rectangle",
          fill: "#ffffff",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotation: 0,
          opacity: 1,
          keyframes: [
            {
              id: "keyframe-1",
              time_ms: 1000,
              easing: "ease_in_out",
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
        },
      ],
    });

    expect(validateProjectDocument(project)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("accepts vertical neon text with a typewriter effect", () => {
    const project = validProject();
    project.scenes.push({
      id: "canvas",
      name: "Canvas",
      background: { type: "color", color: "#000000" },
      dialogues: [],
      layers: [
        {
          id: "vertical-text",
          type: "text",
          text: "縦書き",
          writing_mode: "vertical",
          font_family: '"Noto Serif JP", serif',
          font_size: 72,
          color: "#ffffff",
          text_style: "neon",
          neon_color: "#9bdcff",
          display_effect: "typewriter",
          characters_per_second: 12,
          x: 100,
          y: 100,
          width: 180,
          height: 700,
          rotation: 0,
          opacity: 1,
        },
      ],
    });

    expect(validateProjectDocument(project)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("accepts editable speech synthesis settings on an audio track", () => {
    const project = validProject();
    project.audio_tracks = [
      {
        id: "narration-1",
        asset_id: "audio-asset-1",
        role: "narration",
        start_ms: 0,
        duration_ms: 2000,
        trim_start_ms: 0,
        volume: 1,
        loop: false,
        fade_in_ms: 0,
        fade_out_ms: 0,
        ducking: false,
        speech_synthesis: {
          provider: "aivis_speech",
          text: "Editable narration",
          style_id: 42,
          speed_scale: 1,
          intonation_scale: 1,
          tempo_dynamics_scale: 1,
          volume_scale: 1,
        },
      },
    ];

    expect(validateProjectDocument(project)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("rejects an unsupported locale", () => {
    expect(
      validateProjectDocument({ ...validProject(), content_locale: "fr" }),
    ).toMatchObject({ valid: false });
  });
});
