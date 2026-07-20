import { describe, expect, it } from "vitest";

import { audioNeedsResync, audioVolumeAtTime } from "./EditorFields";

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
    expect(audioNeedsResync(1, 1.05)).toBe(false);
    expect(audioNeedsResync(1, 1.081)).toBe(true);
  });
});
