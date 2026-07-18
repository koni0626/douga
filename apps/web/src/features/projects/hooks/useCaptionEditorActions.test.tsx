import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { ProjectDocument } from "@douga/project-schema";

import "../../../i18n";
import { useCaptionEditorActions } from "./useCaptionEditorActions";

it("creates timeline captions with the typewriter effect", () => {
  const scene: ProjectDocument["scenes"][number] = {
    id: "scene-1",
    name: "Canvas",
    background: { type: "color", color: "#000000" },
    layers: [],
    dialogues: [],
  };
  const document = {
    schema_version: 1,
    project_id: "project-1",
    name: "Caption test",
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
    scenes: [scene],
  } satisfies ProjectDocument;
  const updateScene = vi.fn((mutator: (value: typeof scene) => void) =>
    mutator(scene),
  );

  const { result } = renderHook(() =>
    useCaptionEditorActions({
      captionDraft: "",
      documentRef: { current: document },
      sceneIndex: 0,
      setCaptionEditing: vi.fn(),
      timeMs: 1250,
      updateScene,
    }),
  );

  act(() => result.current.addCaptionAt(1250));

  expect(scene.dialogues).toHaveLength(1);
  expect(scene.dialogues[0]).toMatchObject({
    display_effect: "typewriter",
    duration_mode: "manual",
    start_ms: 1250,
  });
});
