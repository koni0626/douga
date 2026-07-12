import { describe, expect, it } from "vitest";

import type { CaptionStyle, Dialogue } from "./layout";
import {
  buildSceneTimeline,
  calculateAutoDurationMs,
  layoutDialogue,
  resolveCaptionAtTime,
} from "./layout";

const style: CaptionStyle = {
  x: 0,
  y: 0,
  width: 12,
  height: 4,
  padding: 0,
  font_family: "monospace",
  font_size: 1,
  line_height: 1,
  max_lines: 2,
  text_color: "#fff",
  background_color: "#000",
  background_opacity: 1,
  border_radius: 0,
  text_align: "left",
};

const measure = (text: string) => Array.from(text).length;

function dialogue(
  text: string,
  effect: Dialogue["display_effect"] = "instant",
): Dialogue {
  return {
    id: "dialogue-1",
    speaker: null,
    text,
    display_effect: effect,
    duration_mode: "auto",
    duration_ms: null,
    manual_page_breaks: [],
  };
}

describe("layoutDialogue", () => {
  it("splits Japanese text into fixed line pages", () => {
    const pages = layoutDialogue(
      dialogue("これは日本語の長いテロップです。次のページへ送ります。"),
      style,
      "ja",
      measure,
    );

    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((page) => page.lines.length <= 2)).toBe(true);
    expect(
      pages
        .map((page) => page.text)
        .join("")
        .replace(/\n/gu, ""),
    ).toContain("日本語");
  });

  it("keeps English words together when they fit", () => {
    const pages = layoutDialogue(
      dialogue("Hello world from Douga editor"),
      style,
      "en",
      measure,
    );

    expect(pages[0]?.lines[0]).toBe("Hello world");
  });

  it("respects manual page breaks", () => {
    const value = dialogue("firstsecond");
    value.manual_page_breaks = [5];
    const pages = layoutDialogue(value, style, "en", measure);

    expect(pages.map((page) => page.text)).toEqual(["first", "second"]);
  });
});

describe("timing", () => {
  it("starts a dialogue at its requested timeline position", () => {
    const value = dialogue("later caption");
    value.start_ms = 5000;

    const timeline = buildSceneTimeline(
      {
        id: "scene-1",
        name: "Scene",
        background: { type: "color", color: "#000000" },
        layers: [],
        dialogues: [value],
      },
      style,
      "en",
      measure,
    );

    expect(timeline[0]?.startMs).toBe(5000);
  });

  it("preserves the exact manual duration across multiple pages", () => {
    const value = dialogue("long caption ".repeat(20));
    value.duration_mode = "manual";
    value.duration_ms = 4000;

    const timeline = buildSceneTimeline(
      {
        id: "scene-1",
        name: "Scene",
        background: { type: "color", color: "#000000" },
        layers: [],
        dialogues: [value],
      },
      style,
      "en",
      measure,
    );

    expect(timeline.length).toBeGreaterThan(1);
    expect(timeline.at(-1)?.endMs).toBe(4000);
  });

  it("uses a two second minimum", () => {
    expect(calculateAutoDurationMs("短い", "ja")).toBe(2000);
  });

  it("reveals typewriter text based on time", () => {
    const value = dialogue("abcdefghij", "typewriter");
    const resolved = resolveCaptionAtTime(
      [
        {
          dialogueId: value.id,
          dialogue: value,
          lines: [value.text],
          text: value.text,
          startMs: 0,
          endMs: 3000,
        },
      ],
      500,
      10,
    );

    expect(resolved.lines).toEqual(["abcde"]);
  });
});
