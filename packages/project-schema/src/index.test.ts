import { describe, expect, it } from "vitest";

import { validateProjectDocument } from "./index";

describe("validateProjectDocument", () => {
  it("accepts a minimal valid project", () => {
    const result = validateProjectDocument({
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
    });

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("rejects an unsupported locale", () => {
    const result = validateProjectDocument({
      schema_version: 1,
      project_id: "project-1",
      name: "Sample",
      content_locale: "fr",
      video: { width: 1920, height: 1080, fps: 30 },
      caption_style: {},
      scenes: [],
    });

    expect(result.valid).toBe(false);
  });
});
