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
    expect(validateProjectDocument(validProject())).toEqual({
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

  it("rejects an unsupported locale", () => {
    expect(
      validateProjectDocument({ ...validProject(), content_locale: "fr" }),
    ).toMatchObject({ valid: false });
  });
});
