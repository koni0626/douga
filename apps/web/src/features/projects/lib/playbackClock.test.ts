import { describe, expect, it } from "vitest";

import { playbackTimeAt } from "./playbackClock";

describe("playbackTimeAt", () => {
  it("uses elapsed wall-clock time and wraps at the project duration", () => {
    expect(playbackTimeAt(2_000, 250, 10_000)).toBe(2_250);
    expect(playbackTimeAt(9_900, 250, 10_000)).toBe(150);
  });
});
