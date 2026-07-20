import { useEffect, useMemo, useRef, useState } from "react";

import type { ProjectDocument } from "@douga/project-schema";

import { assetContentUrl } from "../../../shared/lib/api";

type AudioTrack = NonNullable<ProjectDocument["audio_tracks"]>[number];
const HAVE_FUTURE_DATA = 3;
const AUDIO_RESYNC_THRESHOLD_SECONDS = 0.2;
const AUDIO_DRIFT_CHECK_INTERVAL_MS = 1_000;
const AUDIO_TIMELINE_DISCONTINUITY_MS = 250;
const AUDIO_PRELOAD_AHEAD_MS = 15_000;
const AUDIO_PRELOAD_BEHIND_MS = 1_000;

interface AudioPlaybackState {
  activeTrackIds: Set<string>;
  lastDriftCheckAt: number;
  playing: boolean;
  timeMs: number;
  updatedAt: number;
}

export function audioNeedsResync(
  currentSeconds: number,
  targetSeconds: number,
): boolean {
  return (
    Math.abs(currentSeconds - targetSeconds) > AUDIO_RESYNC_THRESHOLD_SECONDS
  );
}

export function audioTrackIsNearTime(
  track: AudioTrack,
  timeMs: number,
): boolean {
  if (track.start_ms > timeMs + AUDIO_PRELOAD_AHEAD_MS) return false;
  if (track.loop || track.duration_ms === undefined) return true;
  return track.start_ms + track.duration_ms >= timeMs - AUDIO_PRELOAD_BEHIND_MS;
}

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
  onBufferingChange,
}: {
  tracks: AudioTrack[];
  playing: boolean;
  timeMs: number;
  onBufferingChange?: (buffering: boolean) => void;
}) {
  const refs = useRef<Record<string, HTMLAudioElement | null>>({});
  const playRequests = useRef<Record<string, Promise<void> | undefined>>({});
  const playbackState = useRef<AudioPlaybackState>({
    activeTrackIds: new Set(),
    lastDriftCheckAt: 0,
    playing: false,
    timeMs: 0,
    updatedAt: 0,
  });
  const [mediaStateVersion, setMediaStateVersion] = useState(0);
  const preparedTracks = useMemo(
    () => tracks.filter((track) => audioTrackIsNearTime(track, timeMs)),
    [timeMs, tracks],
  );

  useEffect(() => {
    const now = performance.now();
    const previous = playbackState.current;
    const active: Array<{
      audio: HTMLAudioElement;
      track: AudioTrack;
      localMs: number;
    }> = [];
    for (const track of preparedTracks) {
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
      active.push({ audio, track, localMs });
    }

    if (!playing) {
      for (const { audio } of active) audio.pause();
      onBufferingChange?.(false);
      playbackState.current = {
        activeTrackIds: new Set(),
        lastDriftCheckAt: previous.lastDriftCheckAt,
        playing: false,
        timeMs,
        updatedAt: now,
      };
      return;
    }

    const buffering = active.some(
      ({ audio }) => audio.readyState < HAVE_FUTURE_DATA,
    );
    onBufferingChange?.(buffering);
    if (buffering) {
      for (const { audio } of active) audio.pause();
      playbackState.current = {
        activeTrackIds: new Set(),
        lastDriftCheckAt: previous.lastDriftCheckAt,
        playing: false,
        timeMs,
        updatedAt: now,
      };
      return;
    }

    const elapsedMs = previous.updatedAt > 0 ? now - previous.updatedAt : 0;
    const timelineDeltaMs = timeMs - previous.timeMs;
    const timelineDiscontinuity =
      !previous.playing ||
      timelineDeltaMs < 0 ||
      Math.abs(timelineDeltaMs - elapsedMs) > AUDIO_TIMELINE_DISCONTINUITY_MS;
    const driftCheckDue =
      now - previous.lastDriftCheckAt >= AUDIO_DRIFT_CHECK_INTERVAL_MS;
    const activeTrackIds = new Set<string>();
    for (const { audio, track, localMs } of active) {
      activeTrackIds.add(track.id);
      const unwrappedTargetSeconds = localMs / 1000;
      const targetSeconds =
        track.loop && Number.isFinite(audio.duration) && audio.duration > 0
          ? unwrappedTargetSeconds % audio.duration
          : unwrappedTargetSeconds;
      const newlyActive = !previous.activeTrackIds.has(track.id);
      if (
        Number.isFinite(audio.duration) &&
        (timelineDiscontinuity || newlyActive || driftCheckDue) &&
        audioNeedsResync(audio.currentTime, targetSeconds)
      ) {
        audio.currentTime = targetSeconds;
      }
      if (!audio.paused || playRequests.current[track.id]) continue;
      const request = audio.play();
      playRequests.current[track.id] = request;
      void request
        .catch(() => undefined)
        .finally(() => delete playRequests.current[track.id]);
    }
    playbackState.current = {
      activeTrackIds,
      lastDriftCheckAt: driftCheckDue ? now : previous.lastDriftCheckAt,
      playing: true,
      timeMs,
      updatedAt: now,
    };
  }, [mediaStateVersion, onBufferingChange, playing, preparedTracks, timeMs]);

  useEffect(
    () => () => {
      onBufferingChange?.(false);
    },
    [onBufferingChange],
  );

  return preparedTracks.map((track) => (
    <audio
      key={`${track.id}:${track.asset_id}`}
      onCanPlay={() => setMediaStateVersion((current) => current + 1)}
      onPlaying={() => setMediaStateVersion((current) => current + 1)}
      onStalled={() => setMediaStateVersion((current) => current + 1)}
      onWaiting={() => setMediaStateVersion((current) => current + 1)}
      playsInline
      preload="auto"
      ref={(element) => {
        refs.current[track.id] = element;
      }}
      src={assetContentUrl(track.asset_id)}
    />
  ));
}
