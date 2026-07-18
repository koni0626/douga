import { type PointerEvent, useEffect, useState } from "react";

import type { ProjectDocument } from "@douga/project-schema";

import {
  type AudioClipRange,
  MIN_AUDIO_CLIP_DURATION_MS,
  moveAudioClip,
  trimAudioClipEnd,
  trimAudioClipStart,
} from "../lib/audioTrim";
import { formatTimelineTime } from "../lib/timelineRange";

type CameraEffect = NonNullable<ProjectDocument["camera_effects"]>[number];
type AudioTrack = NonNullable<ProjectDocument["audio_tracks"]>[number];
type AudioDrag = {
  fadeInMs: number;
  fadeOutMs: number;
  mode: "move" | "trim-start" | "trim-end";
  trackId: string;
  originX: number;
  range: AudioClipRange;
  sourceDurationMs?: number;
  trackWidth: number;
};

export interface CameraTimelineTrackProps {
  effects: CameraEffect[];
  durationMs: number;
  label: string;
  labelFor: (effect: CameraEffect) => string;
  onOpenMenu: (x: number, y: number) => void;
  onSeek: (timeMs: number) => void;
}

export function CameraTimelineTrack({
  effects,
  durationMs,
  label,
  labelFor,
  onOpenMenu,
  onSeek,
}: CameraTimelineTrackProps) {
  return (
    <>
      <div
        className="object-timeline-label camera-timeline-label"
        style={{ gridColumn: 1, gridRow: 3 }}
      >
        <span className="camera-track-icon">●</span>
        {label}
      </div>
      <div
        className="object-timeline-track object-timeline-track--base camera-timeline-track"
        style={{ gridColumn: 2, gridRow: 3 }}
        onPointerDown={(event) => seek(event, durationMs, onSeek)}
      >
        {effects.map((effect) => (
          <div
            className="camera-timeline-clip"
            key={effect.id}
            style={{
              left: `${(effect.start_ms * 100) / durationMs}%`,
              width: `${((effect.end_ms - effect.start_ms) * 100) / durationMs}%`,
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenMenu(event.clientX, event.clientY);
            }}
          >
            {labelFor(effect)}
          </div>
        ))}
      </div>
    </>
  );
}

export interface AudioTimelineTracksProps {
  durationMs: number;
  label: string;
  labelFor: (track: AudioTrack) => string;
  onOpenMenu: (x: number, y: number) => void;
  onSeek: (timeMs: number) => void;
  onChange: (trackId: string, patch: Partial<AudioTrack>) => void;
  sourceDurationFor: (track: AudioTrack) => number | undefined;
  tracks: AudioTrack[];
  trimEndLabel: string;
  trimStartLabel: string;
}

export function AudioTimelineTracks({
  durationMs,
  label,
  labelFor,
  onOpenMenu,
  onSeek,
  onChange,
  sourceDurationFor,
  tracks,
  trimEndLabel,
  trimStartLabel,
}: AudioTimelineTracksProps) {
  const [drag, setDrag] = useState<AudioDrag>();
  const [draftRange, setDraftRange] = useState<AudioClipRange>();

  useEffect(() => {
    if (!drag) return;
    const rangeAt = (clientX: number) => {
      const deltaMs = ((clientX - drag.originX) / drag.trackWidth) * durationMs;
      if (drag.mode === "trim-start")
        return trimAudioClipStart(drag.range, deltaMs);
      if (drag.mode === "trim-end")
        return trimAudioClipEnd(drag.range, drag.sourceDurationMs, deltaMs);
      return {
        ...drag.range,
        startMs: moveAudioClip(
          drag.range.startMs,
          drag.range.durationMs,
          deltaMs,
          durationMs,
        ),
      };
    };
    const move = (event: globalThis.PointerEvent) =>
      setDraftRange(rangeAt(event.clientX));
    const finish = (event: globalThis.PointerEvent) => {
      const range = rangeAt(event.clientX);
      if (drag.mode === "move") {
        onChange(drag.trackId, { start_ms: range.startMs });
      } else {
        const fadeInMs = Math.min(drag.fadeInMs, range.durationMs);
        onChange(drag.trackId, {
          start_ms: range.startMs,
          trim_start_ms: range.trimStartMs,
          duration_ms: range.durationMs,
          fade_in_ms: fadeInMs,
          fade_out_ms: Math.min(drag.fadeOutMs, range.durationMs - fadeInMs),
        });
      }
      setDrag(undefined);
      setDraftRange(undefined);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
    };
  }, [drag, durationMs, onChange]);

  return tracks.map((track, audioIndex) => {
    const sourceDurationMs = sourceDurationFor(track);
    const storedRange = {
      startMs: track.start_ms,
      trimStartMs: track.trim_start_ms,
      durationMs:
        track.duration_ms ??
        Math.max(
          MIN_AUDIO_CLIP_DURATION_MS,
          (sourceDurationMs ?? durationMs) - track.trim_start_ms,
        ),
    };
    const range =
      drag?.trackId === track.id && draftRange ? draftRange : storedRange;
    const endMs = Math.min(durationMs, range.startMs + range.durationMs);
    const beginDrag = (
      event: PointerEvent<HTMLElement>,
      mode: AudioDrag["mode"],
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const timelineTrack = event.currentTarget.closest(
        ".audio-timeline-track",
      );
      if (!(timelineTrack instanceof HTMLElement)) return;
      seekAtClientX(event.clientX, timelineTrack, durationMs, onSeek);
      setDraftRange(storedRange);
      setDrag({
        fadeInMs: track.fade_in_ms,
        fadeOutMs: track.fade_out_ms,
        mode,
        trackId: track.id,
        originX: event.clientX,
        range: storedRange,
        sourceDurationMs,
        trackWidth: timelineTrack.getBoundingClientRect().width,
      });
    };
    return (
      <div className="object-timeline-row" key={track.id}>
        <div
          className="object-timeline-label audio-timeline-label"
          style={{ gridColumn: 1, gridRow: audioIndex + 4 }}
        >
          <span className="audio-track-icon">♪</span>
          {audioIndex === 0 ? label : labelFor(track)}
        </div>
        <div
          className="object-timeline-track object-timeline-track--base audio-timeline-track"
          style={{ gridColumn: 2, gridRow: audioIndex + 4 }}
          onPointerDown={(event) => seek(event, durationMs, onSeek)}
        >
          <div
            className="audio-timeline-clip"
            style={{
              left: `${(range.startMs * 100) / durationMs}%`,
              width: `${(Math.max(50, endMs - range.startMs) * 100) / durationMs}%`,
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenMenu(event.clientX, event.clientY);
            }}
            onPointerDown={(event) => beginDrag(event, "move")}
          >
            <span
              aria-label={trimStartLabel}
              className="audio-trim-handle audio-trim-handle--start"
              onPointerDown={(event) => beginDrag(event, "trim-start")}
              role="separator"
            />
            {labelFor(track)}
            {drag?.trackId === track.id ? (
              <output className="timeline-drag-time" aria-live="polite">
                {formatTimelineTime(range.startMs)} –{" "}
                {formatTimelineTime(endMs)}
              </output>
            ) : null}
            <span
              aria-label={trimEndLabel}
              className="audio-trim-handle audio-trim-handle--end"
              onPointerDown={(event) => beginDrag(event, "trim-end")}
              role="separator"
            />
          </div>
        </div>
      </div>
    );
  });
}

function seekAtClientX(
  clientX: number,
  element: HTMLElement,
  durationMs: number,
  onSeek: (timeMs: number) => void,
) {
  const bounds = element.getBoundingClientRect();
  onSeek(
    Math.max(
      0,
      Math.min(
        durationMs,
        Math.round(((clientX - bounds.left) / bounds.width) * durationMs),
      ),
    ),
  );
}

function seek(
  event: PointerEvent<HTMLDivElement>,
  durationMs: number,
  onSeek: (timeMs: number) => void,
) {
  if (event.button !== 0) return;
  const bounds = event.currentTarget.getBoundingClientRect();
  onSeek(
    Math.max(
      0,
      Math.min(
        durationMs,
        Math.round(((event.clientX - bounds.left) / bounds.width) * durationMs),
      ),
    ),
  );
}
