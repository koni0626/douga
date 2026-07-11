import { useEffect, useRef } from "react";

import type { ProjectDocument } from "@douga/project-schema";

import { assetContentUrl } from "../../../shared/lib/api";

type AudioTrack = NonNullable<ProjectDocument["audio_tracks"]>[number];

export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function AudioPreview({
  tracks,
  playing,
  timeMs,
}: {
  tracks: AudioTrack[];
  playing: boolean;
  timeMs: number;
}) {
  const refs = useRef<Record<string, HTMLAudioElement | null>>({});
  useEffect(() => {
    for (const track of tracks) {
      const audio = refs.current[track.id];
      if (!audio) continue;
      const localMs = timeMs - track.start_ms + track.trim_start_ms;
      audio.volume = Math.min(1, track.volume);
      audio.loop = track.loop;
      if (localMs < 0) {
        audio.pause();
        continue;
      }
      const targetSeconds = localMs / 1000;
      if (
        Number.isFinite(audio.duration) &&
        Math.abs(audio.currentTime - targetSeconds) > 0.35
      ) {
        audio.currentTime =
          track.loop && audio.duration > 0
            ? targetSeconds % audio.duration
            : targetSeconds;
      }
      if (playing) void audio.play().catch(() => undefined);
      else audio.pause();
    }
  }, [playing, timeMs, tracks]);

  return tracks.map((track) => (
    <audio
      key={track.id}
      ref={(element) => {
        refs.current[track.id] = element;
      }}
      src={assetContentUrl(track.asset_id)}
      preload="metadata"
    />
  ));
}
