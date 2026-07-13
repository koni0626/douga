import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ProjectDocument } from "@douga/project-schema";

import "../../../i18n";
import { CanvasObjectContextMenu } from "./CanvasObjectContextMenu";

type Layer = ProjectDocument["scenes"][number]["layers"][number];

const textLayer: Layer = {
  id: "text-1",
  type: "text",
  text: "Text",
  writing_mode: "vertical",
  font_family: "sans-serif",
  font_size: 64,
  color: "#ffffff",
  text_style: "solid",
  neon_color: "#9bdcff",
  display_effect: "instant",
  x: 0,
  y: 0,
  width: 800,
  height: 120,
  rotation: 0,
  opacity: 1,
};

describe("CanvasObjectContextMenu", () => {
  it("updates vertical text font, neon style, and typewriter effect from the text panel", () => {
    const onTextPatch = vi.fn();
    const view = render(
      <CanvasObjectContextMenu
        animationLabels={{
          animation: "Animation",
          back: "Back",
          duration: "Duration",
          effect: "Effect",
          remove: "Remove",
          presets: {
            slide_left: "slide_left",
            slide_right: "slide_right",
            slide_up: "slide_up",
            slide_down: "slide_down",
            zoom_in: "zoom_in",
            pop: "pop",
            bounce: "bounce",
            shake: "shake",
            spin: "spin",
            pulse: "pulse",
            float: "float",
            fade_in: "fade_in",
            fade_out: "fade_out",
            blink: "blink",
            flash: "flash",
          },
        }}
        fillCanvasLabel="Fill"
        flipHorizontalLabel="Flip horizontal"
        flipVerticalLabel="Flip vertical"
        layer={textLayer}
        lockLabel="Lock"
        onApplyAnimation={vi.fn()}
        onClearAnimation={vi.fn()}
        onClose={vi.fn()}
        onFillCanvas={vi.fn()}
        onPatch={vi.fn()}
        onTextPatch={onTextPatch}
        textSettingsLabel="Text settings"
        unlockLabel="Unlock"
        x={0}
        y={0}
      />,
    );

    fireEvent.click(view.getByRole("menuitem", { name: /Text settings/u }));
    fireEvent.change(view.getByLabelText("フォント"), {
      target: { value: '"Noto Sans JP", "Yu Gothic", sans-serif' },
    });
    fireEvent.click(view.getByLabelText("ネオングラデーション"));
    fireEvent.change(view.getByLabelText("表示エフェクト"), {
      target: { value: "typewriter" },
    });

    expect(onTextPatch).toHaveBeenCalledWith({
      font_family: '"Noto Sans JP", "Yu Gothic", sans-serif',
    });
    expect(onTextPatch).toHaveBeenCalledWith({ text_style: "neon" });
    expect(onTextPatch).toHaveBeenCalledWith({
      display_effect: "typewriter",
    });
  });
});
