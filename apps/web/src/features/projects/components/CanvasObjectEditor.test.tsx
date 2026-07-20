import { fireEvent, render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ProjectDocument } from "@douga/project-schema";

import "../../../i18n";
import { CanvasObjectEditor } from "./CanvasObjectEditor";

type Layer = ProjectDocument["scenes"][number]["layers"][number];

const verticalTextLayer: Layer = {
  id: "text-1",
  type: "text",
  text: "縦書き",
  writing_mode: "vertical",
  font_family: "sans-serif",
  font_size: 64,
  color: "#ffffff",
  text_style: "solid",
  neon_color: "#9bdcff",
  display_effect: "instant",
  x: 100,
  y: 100,
  width: 200,
  height: 700,
  rotation: 0,
  opacity: 1,
};

function renderEditor(onCommit = vi.fn(), layer: Layer = verticalTextLayer) {
  return {
    onCommit,
    view: render(
      <>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
        >
          Outside
        </button>
        <CanvasObjectEditor
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
          cameraTransform={{ rotation: 0, scale: 1, x: 0, y: 0 }}
          downloadImageLabel="Download image"
          fillCanvasLabel="Fill"
          flipHorizontalLabel="Flip horizontal"
          flipVerticalLabel="Flip vertical"
          height={1080}
          inlineTextLabel="Edit text directly"
          layers={[layer]}
          lockLabel="Lock"
          lockedLabel="Locked"
          onApplyAnimation={vi.fn()}
          onClearAnimation={vi.fn()}
          onCommit={onCommit}
          onDownloadImage={vi.fn()}
          onPreview={vi.fn()}
          onSelect={vi.fn()}
          selectedLayerId={layer.id}
          textSettingsLabel="Text settings"
          unlockLabel="Unlock"
          width={1920}
        />
      </>,
    ),
  };
}

function textHitbox(container: HTMLElement): SVGRectElement {
  const hitbox = container.querySelector<SVGRectElement>(
    '.canvas-object-hitbox[aria-label="text"]',
  );
  if (!hitbox) throw new Error("text hitbox was not rendered");
  return hitbox;
}

describe("CanvasObjectEditor", () => {
  it("renders independent resize handles for all four edges", () => {
    const { view } = renderEditor();

    expect(
      view.container.querySelectorAll(".canvas-object-resize-handle"),
    ).toHaveLength(8);
    for (const anchor of ["n", "e", "s", "w"]) {
      expect(
        view.container.querySelector(`[data-resize-anchor="${anchor}"]`),
      ).not.toBeNull();
    }
  });

  it("edits vertical text directly on the canvas", () => {
    const narrowLayer = { ...verticalTextLayer, width: 80 };
    const onCommit = vi.fn();
    const { view } = renderEditor(onCommit, narrowLayer);

    fireEvent.doubleClick(textHitbox(view.container));
    const input = view.getByRole("textbox", { name: "Edit text directly" });
    expect(input).toHaveStyle({ writingMode: "vertical-rl" });

    fireEvent.change(input, { target: { value: "画面上で\n編集" } });
    expect(input.parentElement).toHaveAttribute("width", "160");
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledWith(verticalTextLayer.id, {
      text: "画面上で\n編集",
      width: 160,
      x: 20,
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("closes text settings when an outside pointer event stops bubbling", () => {
    const { view } = renderEditor();
    fireEvent.contextMenu(textHitbox(view.container));
    fireEvent.click(view.getByRole("menuitem", { name: /Text settings/u }));
    expect(view.container.querySelector(".text-style-menu")).not.toBeNull();

    fireEvent.pointerDown(
      within(view.container).getByRole("button", { name: "Outside" }),
    );

    expect(view.container.querySelector(".text-style-menu")).toBeNull();
  });
});
