import { describe, expect, it } from "vitest";

import {
  followPlayheadScroll,
  TIMELINE_LABEL_WIDTH_PX,
  timelineTrackWidth,
} from "./timelineViewport";

describe("timeline viewport", () => {
  it("uses a compact fixed time scale", () => {
    expect(timelineTrackWidth(10_000)).toBe(480);
    expect(timelineTrackWidth(20_000)).toBe(960);
  });

  it("follows a playhead that leaves the visible time area", () => {
    expect(followPlayheadScroll(0, 600, 580)).toBe(160);
    expect(followPlayheadScroll(160, 600, TIMELINE_LABEL_WIDTH_PX)).toBe(0);
    expect(followPlayheadScroll(160, 600, 400)).toBe(160);
  });
});
