import { describe, expect, it } from "vitest";

import {
  clampAudioTrimRange,
  MIN_AUDIO_CLIP_DURATION_MS,
  moveAudioClip,
  trimAudioClipEnd,
  trimAudioClipStart,
} from "./audioTrim";

describe("clampAudioTrimRange", () => {
  it("keeps the selected range inside the uploaded audio", () => {
    expect(clampAudioTrimRange(10_000, 3_000, 9_000)).toEqual({
      trimStartMs: 3_000,
      durationMs: 7_000,
    });
  });

  it("keeps a minimum editable clip at the end of the audio", () => {
    expect(clampAudioTrimRange(10_000, 12_000, 0)).toEqual({
      trimStartMs: 10_000 - MIN_AUDIO_CLIP_DURATION_MS,
      durationMs: MIN_AUDIO_CLIP_DURATION_MS,
    });
  });
});

describe("audio clip drag operations", () => {
  const range = { startMs: 2000, trimStartMs: 1000, durationMs: 5000 };

  it("moves a clip in 50ms precision", () => {
    expect(moveAudioClip(2000, 5000, 127, 10_000)).toBe(2150);
  });

  it("trims the left edge while keeping source and timeline aligned", () => {
    expect(trimAudioClipStart(range, 1250)).toEqual({
      startMs: 3250,
      trimStartMs: 2250,
      durationMs: 3750,
    });
    expect(trimAudioClipStart(range, -5000)).toEqual({
      startMs: 1000,
      trimStartMs: 0,
      durationMs: 6000,
    });
  });

  it("trims the right edge without exceeding the source", () => {
    expect(trimAudioClipEnd(range, 7000, 5000)).toEqual({
      startMs: 2000,
      trimStartMs: 1000,
      durationMs: 6000,
    });
  });
});
