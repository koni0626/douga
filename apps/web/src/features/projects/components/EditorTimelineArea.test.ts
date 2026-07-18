import { describe, expect, it } from "vitest";

import { isFileDrag } from "./EditorTimelineArea";

describe("isFileDrag", () => {
  it("ignores an internal layer reorder drag", () => {
    expect(isFileDrag({ types: ["application/x-douga-layer"] })).toBe(false);
  });

  it("accepts an external file drag", () => {
    expect(isFileDrag({ types: ["Files"] })).toBe(true);
  });
});
