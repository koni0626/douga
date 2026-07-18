import { describe, expect, it } from "vitest";

import {
  followPlayheadScroll,
  TIMELINE_LABEL_WIDTH_PX,
  timelineSecondWidth,
  timelineTrackWidth,
} from "./timelineViewport";

describe("timeline viewport", () => {
  it("uses a compact fixed time scale", () => {
    expect(timelineTrackWidth(10_000)).toBe(480);
    expect(timelineTrackWidth(20_000)).toBe(960);
  });

  it("uses the same effective second width for ruler ticks and row grid lines", () => {
    const durationMs = 14_350;
    const trackWidth = timelineTrackWidth(durationMs);
    const secondWidth = timelineSecondWidth(durationMs);

    expect(trackWidth).toBeCloseTo(688.8);
    expect((14_000 / durationMs) * trackWidth).toBeCloseTo(14 * secondWidth);
    expect(timelineSecondWidth(5000)).toBe(96);
  });

  it("follows a playhead that leaves the visible time area", () => {
    expect(followPlayheadScroll(0, 600, 580)).toBe(160);
    expect(followPlayheadScroll(160, 600, TIMELINE_LABEL_WIDTH_PX)).toBe(0);
    expect(followPlayheadScroll(160, 600, 400)).toBe(160);
  });
});
