import { describe, expect, it } from "vitest";

import type { ProjectDocument } from "@douga/project-schema";

import { buildCaptionTimelineClips } from "./captionTimeline";

const style: ProjectDocument["caption_style"] = {
  x: 140,
  y: 760,
  width: 1640,
  height: 240,
  padding: 40,
  font_family: "sans-serif",
  font_size: 56,
  line_height: 1.35,
  max_lines: 2,
  text_color: "#fff",
  background_color: "#000",
  background_opacity: 0.75,
  border_radius: 24,
  text_align: "left",
};

it("aggregates pages into one visible clip per caption", () => {
  const scene: ProjectDocument["scenes"][number] = {
    id: "scene",
    name: "Canvas",
    background: { type: "color", color: "#000" },
    layers: [],
    dialogues: [
      {
        id: "caption-a",
        text: "長いテロップ".repeat(80),
        start_ms: 1000,
        display_effect: "instant",
        duration_mode: "manual",
        duration_ms: 4000,
        manual_page_breaks: [],
      },
    ],
  };

  expect(buildCaptionTimelineClips(scene, style, "ja")).toEqual([
    {
      id: "caption-a",
      text: "長いテロップ".repeat(80),
      startMs: 1000,
      endMs: 5000,
    },
  ]);
});

describe("caption clip ordering", () => {
  it("sorts clips by their resolved start time", () => {
    const dialogue = (
      id: string,
      text: string,
      startMs: number,
    ): ProjectDocument["scenes"][number]["dialogues"][number] => ({
      id,
      text,
      start_ms: startMs,
      display_effect: "instant",
      duration_mode: "manual",
      duration_ms: 1000,
      manual_page_breaks: [],
    });
    const scene: ProjectDocument["scenes"][number] = {
      id: "scene",
      name: "Canvas",
      background: { type: "color", color: "#000" },
      layers: [],
      dialogues: [dialogue("late", "後", 3000), dialogue("early", "先", 0)],
    };

    expect(
      buildCaptionTimelineClips(scene, style, "ja").map((clip) => clip.id),
    ).toEqual(["late", "early"]);
  });
});
