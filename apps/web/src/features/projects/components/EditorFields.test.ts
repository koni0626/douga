import { describe, expect, it } from "vitest";

import {
  audioNeedsResync,
  audioTrackIsNearTime,
  audioVolumeAtTime,
} from "./EditorFields";

const track = {
  id: "audio-1",
  asset_id: "asset-1",
  role: "bgm" as const,
  start_ms: 2000,
  duration_ms: 5000,
  trim_start_ms: 0,
  volume: 0.8,
  loop: false,
  fade_in_ms: 1000,
  fade_out_ms: 2000,
  ducking: false,
};

describe("audioVolumeAtTime", () => {
  it("applies start position and fade in", () => {
    expect(audioVolumeAtTime(track, 1500)).toBe(0);
    expect(audioVolumeAtTime(track, 2500)).toBeCloseTo(0.4);
    expect(audioVolumeAtTime(track, 3000)).toBeCloseTo(0.8);
  });

  it("applies fade out and stops after the clip", () => {
    expect(audioVolumeAtTime(track, 6000)).toBeCloseTo(0.4);
    expect(audioVolumeAtTime(track, 7000)).toBe(0);
  });
});

describe("audioNeedsResync", () => {
  it("corrects audible drift without seeking for normal frame jitter", () => {
    expect(audioNeedsResync(1, 1.19)).toBe(false);
    expect(audioNeedsResync(1, 1.201)).toBe(true);
  });
});

describe("audioTrackIsNearTime", () => {
  it("preloads upcoming tracks and releases completed tracks", () => {
    expect(audioTrackIsNearTime(track, -13_000)).toBe(true);
    expect(audioTrackIsNearTime(track, -13_001)).toBe(false);
    expect(audioTrackIsNearTime(track, 7_999)).toBe(true);
    expect(audioTrackIsNearTime(track, 8_001)).toBe(false);
  });

  it("keeps looped and unknown-duration tracks after their start", () => {
    expect(audioTrackIsNearTime({ ...track, loop: true }, 60_000)).toBe(true);
    expect(
      audioTrackIsNearTime({ ...track, duration_ms: undefined }, 60_000),
    ).toBe(true);
  });
});
