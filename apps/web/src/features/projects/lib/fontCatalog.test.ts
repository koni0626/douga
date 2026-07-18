import { describe, expect, it } from "vitest";

import { BUNDLED_FONT_OPTIONS, FONT_OPTIONS } from "./fontCatalog";

describe("font catalog", () => {
  it("provides twenty bundled Japanese font families", () => {
    expect(BUNDLED_FONT_OPTIONS).toHaveLength(20);
    expect(
      BUNDLED_FONT_OPTIONS.every((font) => font.source === "bundled"),
    ).toBe(true);
  });

  it("uses unique CSS font-family values", () => {
    const families = FONT_OPTIONS.map((font) => font.family);
    expect(new Set(families).size).toBe(families.length);
  });
});
