import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectDocument } from "@douga/project-schema";

import { i18n } from "../../../i18n";
import { CaptionStyleSettings } from "./CaptionStyleSettings";

const captionStyle: ProjectDocument["caption_style"] = {
  x: 140,
  y: 760,
  width: 1640,
  height: 240,
  padding: 40,
  font_family: "sans-serif",
  font_size: 56,
  font_weight: 700,
  line_height: 1.35,
  max_lines: 2,
  text_color: "#ffffff",
  background_color: "#000000",
  background_opacity: 0.75,
  border_radius: 24,
  text_align: "left",
};

describe("CaptionStyleSettings", () => {
  afterEach(cleanup);

  beforeEach(async () => {
    await i18n.changeLanguage("ja");
  });

  it("updates the caption background box settings", () => {
    const onUpdate = vi.fn();
    const view = render(
      <CaptionStyleSettings captionStyle={captionStyle} onUpdate={onUpdate} />,
    );

    fireEvent.change(view.getByLabelText("背景色"), {
      target: { value: "#123456" },
    });
    expect(onUpdate).toHaveBeenCalledWith({ background_color: "#123456" });

    fireEvent.change(view.getByLabelText("角丸"), {
      target: { value: "32" },
    });
    expect(onUpdate).toHaveBeenCalledWith({ border_radius: 32 });

    fireEvent.change(view.getByLabelText("透明度"), {
      target: { value: "40" },
    });
    expect(onUpdate).toHaveBeenCalledWith({ background_opacity: 0.6 });

    const visible = view.getByLabelText("背景ボックスを表示");
    expect(visible).toBeChecked();
    fireEvent.click(visible);
    expect(onUpdate).toHaveBeenCalledWith({ background_opacity: 0 });
  });

  it("restores the last visible opacity when the background is shown again", () => {
    const onUpdate = vi.fn();
    const view = render(
      <CaptionStyleSettings captionStyle={captionStyle} onUpdate={onUpdate} />,
    );

    view.rerender(
      <CaptionStyleSettings
        captionStyle={{ ...captionStyle, background_opacity: 0 }}
        onUpdate={onUpdate}
      />,
    );
    fireEvent.click(view.getByLabelText("背景ボックスを表示"));

    expect(onUpdate).toHaveBeenCalledWith({ background_opacity: 0.75 });
  });
});
