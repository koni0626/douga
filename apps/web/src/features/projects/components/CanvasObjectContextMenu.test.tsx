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

const shapeLayer: Layer = {
  id: "shape-1",
  type: "shape",
  shape: "rectangle",
  fill: "#42a5f5",
  x: 0,
  y: 0,
  width: 800,
  height: 120,
  rotation: 0,
  opacity: 1,
};

const imageLayer: Layer = {
  id: "image-1",
  type: "image",
  asset_id: "asset-1",
  x: 0,
  y: 0,
  width: 800,
  height: 600,
  rotation: 0,
  opacity: 1,
};

const animationLabels = {
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
} as const;

function menuProps(layer: Layer) {
  return {
    animationLabels,
    downloadImageLabel: "Download image",
    fillCanvasLabel: "Fill",
    flipHorizontalLabel: "Flip horizontal",
    flipVerticalLabel: "Flip vertical",
    layer,
    lockLabel: "Lock",
    onApplyAnimation: vi.fn(),
    onClearAnimation: vi.fn(),
    onClose: vi.fn(),
    onDownloadImage: vi.fn(),
    onFillCanvas: vi.fn(),
    onPatch: vi.fn(),
    onShapePatch: vi.fn(),
    onTextPatch: vi.fn(),
    textSettingsLabel: "Text settings",
    unlockLabel: "Unlock",
    x: 0,
    y: 0,
  };
}

describe("CanvasObjectContextMenu", () => {
  it("updates vertical text font, neon style, and typewriter effect from the text panel", () => {
    const onTextPatch = vi.fn();
    const props = menuProps(textLayer);
    const view = render(
      <CanvasObjectContextMenu {...props} onTextPatch={onTextPatch} />,
    );

    fireEvent.click(view.getByRole("menuitem", { name: /Text settings/u }));
    fireEvent.change(view.getByLabelText("フォント"), {
      target: { value: '"Noto Sans JP", "Yu Gothic", sans-serif' },
    });
    const fontSizeInput = view.getByLabelText("文字サイズ");
    fireEvent.change(fontSizeInput, { target: { value: "" } });
    fireEvent.change(fontSizeInput, { target: { value: "96" } });
    fireEvent.click(view.getByLabelText("ネオングラデーション"));
    fireEvent.change(view.getByLabelText("表示エフェクト"), {
      target: { value: "typewriter" },
    });

    expect(onTextPatch).toHaveBeenCalledWith({
      font_family: '"Noto Sans JP", "Yu Gothic", sans-serif',
    });
    expect(onTextPatch).toHaveBeenCalledWith({ text_style: "neon" });
    expect(onTextPatch).toHaveBeenCalledWith({ font_size: 96 });
    expect(onTextPatch).toHaveBeenCalledWith({
      display_effect: "typewriter",
    });
  });

  it("updates a rectangle color and transparency from the shape panel", () => {
    const onShapePatch = vi.fn();
    const props = menuProps(shapeLayer);
    const view = render(
      <CanvasObjectContextMenu {...props} onShapePatch={onShapePatch} />,
    );

    fireEvent.click(view.getByRole("menuitem", { name: /図形設定/u }));
    fireEvent.change(view.getByLabelText("色"), {
      target: { value: "#ff0000" },
    });
    fireEvent.change(view.getByRole("slider"), {
      target: { value: "35" },
    });

    expect(onShapePatch).toHaveBeenCalledWith({ fill: "#ff0000" });
    expect(onShapePatch).toHaveBeenCalledWith({ opacity: 0.65 });
  });

  it("downloads image layers even when they are locked", () => {
    const onDownloadImage = vi.fn();
    const onClose = vi.fn();
    const props = menuProps({ ...imageLayer, locked: true });
    const view = render(
      <CanvasObjectContextMenu
        {...props}
        onClose={onClose}
        onDownloadImage={onDownloadImage}
      />,
    );

    const download = view.getByRole("menuitem", { name: "Download image" });
    expect(download).not.toBeDisabled();
    fireEvent.click(download);

    expect(onDownloadImage).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
