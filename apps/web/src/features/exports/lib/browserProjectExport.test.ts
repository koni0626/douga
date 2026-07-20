import { describe, expect, it, vi } from "vitest";

import type { ProjectDocument } from "@douga/project-schema";

import { browserExportSupported } from "./browserProjectExport";

const project = {
  schema_version: 1,
  project_id: "project",
  name: "project",
  content_locale: "ja",
  video: { width: 1920, height: 1080, fps: 10 },
  caption_style: {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    padding: 10,
    font_family: "sans-serif",
    font_size: 20,
    line_height: 1.2,
    max_lines: 2,
    text_color: "#ffffff",
    background_color: "#000000",
    background_opacity: 0.8,
    border_radius: 0,
    text_align: "left",
  },
  scenes: [],
} satisfies ProjectDocument;

describe("browserExportSupported", () => {
  it("rejects a browser without WebCodecs", () => {
    vi.stubGlobal("VideoEncoder", undefined);
    expect(browserExportSupported(project)).toBe(false);
    vi.unstubAllGlobals();
  });
});
