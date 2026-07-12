import { useEffect, useRef } from "react";

import type { ProjectDocument } from "@douga/project-schema";

import { assetContentUrl } from "../../../shared/lib/api";

type AudioTrack = NonNullable<ProjectDocument["audio_tracks"]>[number];

export function audioVolumeAtTime(
  track: AudioTrack,
  timeMs: number,
  mediaDurationMs?: number,
): number {
  const elapsedMs = timeMs - track.start_ms;
  if (elapsedMs < 0) return 0;
  const durationMs = track.duration_ms ?? mediaDurationMs;
  if (durationMs && !track.loop && elapsedMs >= durationMs) return 0;
  const playbackMs =
    durationMs && track.loop ? elapsedMs % durationMs : elapsedMs;
  const fadeIn =
    track.fade_in_ms > 0 ? Math.min(1, playbackMs / track.fade_in_ms) : 1;
  const fadeOut =
    durationMs && track.fade_out_ms > 0
      ? Math.min(1, Math.max(0, durationMs - playbackMs) / track.fade_out_ms)
      : 1;
  return Math.max(0, Math.min(1, track.volume * fadeIn * fadeOut));
}

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
      const mediaDurationMs = Number.isFinite(audio.duration)
        ? Math.max(0, audio.duration * 1000 - track.trim_start_ms)
        : undefined;
      audio.volume = audioVolumeAtTime(track, timeMs, mediaDurationMs);
      audio.loop = track.loop;
      if (
        localMs < 0 ||
        (!track.loop &&
          (track.duration_ms ?? mediaDurationMs) !== undefined &&
          timeMs - track.start_ms >=
            (track.duration_ms ?? mediaDurationMs ?? 0))
      ) {
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
