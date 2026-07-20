import "@testing-library/jest-dom/vitest";

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectDocument } from "@douga/project-schema";

import { AudioPreview } from "./EditorFields";

type AudioTrack = NonNullable<ProjectDocument["audio_tracks"]>[number];

const track: AudioTrack = {
  id: "audio-1",
  asset_id: "asset-1",
  role: "narration",
  start_ms: 0,
  duration_ms: 5_000,
  trim_start_ms: 0,
  volume: 1,
  loop: false,
  fade_in_ms: 0,
  fade_out_ms: 0,
  ducking: false,
};

afterEach(cleanup);

describe("AudioPreview", () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(
      () => undefined,
    );
  });

  it("preloads complete audio data before timeline playback reaches the clip", () => {
    const { container } = render(
      <AudioPreview playing={false} timeMs={0} tracks={[track]} />,
    );

    expect(container.querySelector("audio")).toHaveAttribute("preload", "auto");
  });

  it("recreates the audio element when a revision replaces its asset", () => {
    const { container, rerender } = render(
      <AudioPreview playing={false} timeMs={0} tracks={[track]} />,
    );
    const first = container.querySelector("audio");

    rerender(
      <AudioPreview
        playing={false}
        timeMs={0}
        tracks={[{ ...track, asset_id: "asset-2" }]}
      />,
    );

    expect(container.querySelector("audio")).not.toBe(first);
    expect(container.querySelector("audio")?.src).toContain("asset-2");
  });

  it("only mounts audio near the current playback position", () => {
    const laterTrack = {
      ...track,
      id: "audio-2",
      asset_id: "asset-2",
      start_ms: 30_000,
    };
    const { container, rerender } = render(
      <AudioPreview playing={false} timeMs={0} tracks={[track, laterTrack]} />,
    );

    expect(container.querySelectorAll("audio")).toHaveLength(1);
    expect(container.querySelector("audio")?.src).toContain("asset-1");

    rerender(
      <AudioPreview
        playing={false}
        timeMs={16_000}
        tracks={[track, laterTrack]}
      />,
    );

    expect(container.querySelectorAll("audio")).toHaveLength(1);
    expect(container.querySelector("audio")?.src).toContain("asset-2");
  });
});
