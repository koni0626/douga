import { describe, expect, it } from "vitest";

import {
  MIN_TIMELINE_CLIP_DURATION_MS,
  moveTimelineRange,
  snapTimelineRange,
} from "./timelineRange";

describe("moveTimelineRange", () => {
  it("moves a clip without changing its duration", () => {
    expect(
      moveTimelineRange({ startMs: 1000, endMs: 3000 }, 1500, "move", {
        durationMs: 10_000,
      }),
    ).toEqual({ startMs: 2500, endMs: 4500 });
  });

  it("keeps object clips within a bounded timeline", () => {
    expect(
      moveTimelineRange({ startMs: 7000, endMs: 9000 }, 5000, "move", {
        durationMs: 10_000,
      }),
    ).toEqual({ startMs: 8000, endMs: 10_000 });
  });

  it("allows caption ends to extend the timeline", () => {
    expect(
      moveTimelineRange({ startMs: 4000, endMs: 5000 }, 2000, "end"),
    ).toEqual({ startMs: 4000, endMs: 7000 });
  });

  it("enforces the minimum duration", () => {
    expect(
      moveTimelineRange({ startMs: 1000, endMs: 3000 }, 5000, "start"),
    ).toEqual({
      startMs: 3000 - MIN_TIMELINE_CLIP_DURATION_MS,
      endMs: 3000,
    });
  });
});

it("snaps both edges to 50 milliseconds", () => {
  expect(snapTimelineRange({ startMs: 1024, endMs: 2990 })).toEqual({
    startMs: 1000,
    endMs: 3000,
  });
});
