import { describe, expect, it } from "vitest";

import {
  MIN_CANVAS_OBJECT_SIZE,
  resizeRectangleFromAnchor,
} from "./canvasResize";

const rectangle = {
  x: 100,
  y: 200,
  width: 300,
  height: 180,
  rotation: 0,
};

describe("resizeRectangleFromAnchor", () => {
  it.each([
    ["e", 60, 0, { width: 360 }],
    ["e", -60, 0, { width: 240 }],
    ["w", -60, 0, { width: 360, x: 40 }],
    ["w", 60, 0, { width: 240, x: 160 }],
    ["s", 0, 50, { height: 230 }],
    ["s", 0, -50, { height: 130 }],
    ["n", 0, -50, { height: 230, y: 150 }],
    ["n", 0, 50, { height: 130, y: 250 }],
  ] as const)("resizes only the %s edge", (anchor, x, y, expected) => {
    expect(resizeRectangleFromAnchor(rectangle, anchor, x, y)).toEqual(
      expected,
    );
  });

  it("keeps the opposite edge fixed when shrinking to the minimum size", () => {
    expect(resizeRectangleFromAnchor(rectangle, "w", 1000, 0)).toEqual({
      width: MIN_CANVAS_OBJECT_SIZE,
      x: rectangle.x + rectangle.width - MIN_CANVAS_OBJECT_SIZE,
    });
    expect(resizeRectangleFromAnchor(rectangle, "n", 0, 1000)).toEqual({
      height: MIN_CANVAS_OBJECT_SIZE,
      y: rectangle.y + rectangle.height - MIN_CANVAS_OBJECT_SIZE,
    });
  });

  it("interprets edge movement in the rotated object's local coordinates", () => {
    expect(
      resizeRectangleFromAnchor({ ...rectangle, rotation: 90 }, "e", 0, 60),
    ).toEqual({ width: 360 });
  });

  it("keeps the existing proportional resize behavior for corner handles", () => {
    expect(resizeRectangleFromAnchor(rectangle, "se", 60, 0)).toEqual({
      width: 360,
      height: 216,
    });
  });
});
