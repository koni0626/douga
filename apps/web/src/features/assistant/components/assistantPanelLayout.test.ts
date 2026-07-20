import { describe, expect, it } from "vitest";

import {
  assistantPanelMaxWidth,
  clampAssistantPanelWidth,
} from "./assistantPanelLayout";

describe("assistant panel layout", () => {
  it("allows the panel to occupy up to half of the viewport", () => {
    expect(assistantPanelMaxWidth(1_920)).toBe(960);
    expect(clampAssistantPanelWidth(1_200, 1_920)).toBe(960);
    expect(clampAssistantPanelWidth(700, 1_920)).toBe(700);
  });

  it("keeps the minimum width on a narrow viewport", () => {
    expect(assistantPanelMaxWidth(600)).toBe(320);
    expect(clampAssistantPanelWidth(100, 600)).toBe(320);
  });
});
