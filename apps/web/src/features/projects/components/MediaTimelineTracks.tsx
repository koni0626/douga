import { type PointerEvent, useEffect, useState } from "react";

import type { ProjectDocument } from "@douga/project-schema";

import { formatTimelineTime } from "../lib/timelineRange";

type CameraEffect = NonNullable<ProjectDocument["camera_effects"]>[number];
type AudioTrack = NonNullable<ProjectDocument["audio_tracks"]>[number];
type AudioDrag = {
  trackId: string;
  originX: number;
  startMs: number;
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
  onStartChange: (trackId: string, startMs: number) => void;
  tracks: AudioTrack[];
}

export function AudioTimelineTracks({
  durationMs,
  label,
  labelFor,
  onOpenMenu,
  onSeek,
  onStartChange,
  tracks,
}: AudioTimelineTracksProps) {
  const [drag, setDrag] = useState<AudioDrag>();
  const [draftStart, setDraftStart] = useState<number>();

  useEffect(() => {
    if (!drag) return;
    const startAt = (clientX: number) =>
      Math.max(
        0,
        Math.min(
          durationMs - 50,
          drag.startMs +
            ((clientX - drag.originX) / drag.trackWidth) * durationMs,
        ),
      );
    const move = (event: globalThis.PointerEvent) =>
      setDraftStart(startAt(event.clientX));
    const finish = (event: globalThis.PointerEvent) => {
      onStartChange(drag.trackId, Math.round(startAt(event.clientX) / 50) * 50);
      setDrag(undefined);
      setDraftStart(undefined);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
    };
  }, [drag, durationMs, onStartChange]);

  return tracks.map((track, audioIndex) => {
    const startMs =
      drag?.trackId === track.id && draftStart !== undefined
        ? draftStart
        : track.start_ms;
    const endMs = Math.min(
      durationMs,
      track.loop || !track.duration_ms
        ? durationMs
        : startMs + track.duration_ms,
    );
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
              left: `${(startMs * 100) / durationMs}%`,
              width: `${(Math.max(50, endMs - startMs) * 100) / durationMs}%`,
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenMenu(event.clientX, event.clientY);
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const timelineTrack = event.currentTarget.parentElement;
              if (!timelineTrack) return;
              setDraftStart(track.start_ms);
              setDrag({
                trackId: track.id,
                originX: event.clientX,
                startMs: track.start_ms,
                trackWidth: timelineTrack.getBoundingClientRect().width,
              });
            }}
          >
            {labelFor(track)}
            {drag?.trackId === track.id ? (
              <output className="timeline-drag-time" aria-live="polite">
                {formatTimelineTime(startMs)} – {formatTimelineTime(endMs)}
              </output>
            ) : null}
          </div>
        </div>
      </div>
    );
  });
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
