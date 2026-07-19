import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { sampleProject } from "../../../sample-project";
import { RendererSpike } from "./RendererSpike";

afterEach(() => {
  cleanup();
  delete window.__DOUGA_RENDER_PROJECT__;
  delete window.__DOUGA_RENDER_ASSETS__;
  delete window.__DOUGA_RENDER_INFO__;
});

describe("RendererSpike", () => {
  it("uses the project dimensions in portrait render mode", () => {
    window.__DOUGA_RENDER_PROJECT__ = {
      ...structuredClone(sampleProject),
      video: { width: 1080, height: 1920, fps: 10 },
    };

    const view = render(<RendererSpike renderMode />);
    const app = view.container.querySelector("main");
    const shell = view.container.querySelector(".canvas-shell");
    const canvas = view.container.querySelector("[data-render-canvas]");

    expect(app).toHaveStyle({ width: "1080px", height: "1920px" });
    expect(shell).toHaveStyle({ width: "1080px", height: "1920px" });
    expect(canvas).toHaveStyle({ width: "1080px", height: "1920px" });
    expect(canvas).toHaveAttribute("width", "1080");
    expect(canvas).toHaveAttribute("height", "1920");
  });
});
