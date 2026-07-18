import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AudioTrack } from "../lib/editorTypes";
import "../../../i18n";
import { AudioTrackSettings } from "./AudioTrackSettings";

const track: AudioTrack = {
  id: "audio-1",
  asset_id: "asset-1",
  role: "bgm",
  start_ms: 0,
  duration_ms: 8_000,
  trim_start_ms: 2_000,
  volume: 0.7,
  loop: false,
  fade_in_ms: 0,
  fade_out_ms: 0,
  ducking: true,
};

describe("AudioTrackSettings", () => {
  it("trims the clip without exceeding the uploaded audio", () => {
    const onUpdate = vi.fn();
    const view = render(
      <AudioTrackSettings
        fallbackDurationMs={10_000}
        onDelete={vi.fn()}
        onUpdate={onUpdate}
        sourceDurationMs={10_000}
        track={track}
      />,
    );

    fireEvent.change(view.getByLabelText("使用する長さ（秒）"), {
      target: { value: "20" },
    });

    expect(onUpdate).toHaveBeenLastCalledWith({
      trim_start_ms: 2_000,
      duration_ms: 8_000,
      fade_in_ms: 0,
      fade_out_ms: 0,
    });
    view.unmount();
  });
});
