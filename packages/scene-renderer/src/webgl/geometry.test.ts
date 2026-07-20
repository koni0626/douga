import { describe, expect, it } from "vitest";

import { buildQuadVertices, coverTextureCoordinates } from "./geometry";

describe("buildQuadVertices", () => {
  it("maps the source top row to the visual top edge", () => {
    const vertices = buildQuadVertices(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 0, y: 0, rotation: 0, scale: 1 },
      100,
      100,
    );

    expect(vertices[3]).toBe(0);
    expect(vertices[11]).toBe(1);
  });
});

describe("coverTextureCoordinates", () => {
  it("crops a wide source horizontally", () => {
    expect(coverTextureCoordinates(1920, 1080, 1080, 1920)).toEqual({
      u0: 0.341796875,
      u1: 0.658203125,
      v0: 0,
      v1: 1,
    });
  });

  it("crops a tall source vertically", () => {
    expect(coverTextureCoordinates(1080, 1920, 1920, 1080)).toEqual({
      u0: 0,
      u1: 1,
      v0: 0.341796875,
      v1: 0.658203125,
    });
  });
});
