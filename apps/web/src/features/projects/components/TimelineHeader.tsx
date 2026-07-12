import { type Dispatch, type SetStateAction, useRef } from "react";

export interface TimelineHeaderProps {
  collapseLabel: string;
  expandLabel: string;
  expanded: boolean;
  extendLabel: string;
  height: number;
  maximumHeight: number;
  minimumHeight: number;
  onExtend: () => void;
  onHeightChange: Dispatch<SetStateAction<number>>;
  onPlay: () => void;
  onStop: () => void;
  onToggle: () => void;
  playLabel: string;
  playing: boolean;
  resizeLabel: string;
  stopLabel: string;
  timeMs: number;
  title: string;
}

export function TimelineHeader({
  collapseLabel,
  expandLabel,
  expanded,
  extendLabel,
  height,
  maximumHeight,
  minimumHeight,
  onExtend,
  onHeightChange,
  onPlay,
  onStop,
  onToggle,
  playLabel,
  playing,
  resizeLabel,
  stopLabel,
  timeMs,
  title,
}: TimelineHeaderProps) {
  return (
    <>
      {expanded ? (
        <TimelineResizeHandle
          height={height}
          label={resizeLabel}
          maximumHeight={maximumHeight}
          minimumHeight={minimumHeight}
          onHeightChange={onHeightChange}
        />
      ) : null}
      <header className="object-timeline-header">
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? collapseLabel : expandLabel}
          className="timeline-toggle-button"
          onClick={onToggle}
          title={expanded ? collapseLabel : expandLabel}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={expanded ? "m6 9 6 6 6-6" : "m9 6 6 6-6 6"} />
          </svg>
        </button>
        <h2>{title}</h2>
        <button
          type="button"
          className="timeline-extend-button"
          aria-label={extendLabel}
          title={extendLabel}
          onClick={onExtend}
        >
          +5s
        </button>
        <div className="object-timeline-playback">
          <button
            type="button"
            aria-label={playLabel}
            className={
              playing
                ? "timeline-icon-button timeline-icon-button--active"
                : "timeline-icon-button"
            }
            onClick={onPlay}
            title={playLabel}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
          <button
            type="button"
            aria-label={stopLabel}
            className="timeline-icon-button"
            onClick={onStop}
            title={stopLabel}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          </button>
        </div>
        <span>{(timeMs / 1000).toFixed(1)}s</span>
      </header>
    </>
  );
}

interface TimelineResizeHandleProps {
  height: number;
  label: string;
  maximumHeight: number;
  minimumHeight: number;
  onHeightChange: Dispatch<SetStateAction<number>>;
}

function TimelineResizeHandle({
  height,
  label,
  maximumHeight,
  minimumHeight,
  onHeightChange,
}: TimelineResizeHandleProps) {
  const originRef = useRef<{ height: number; y: number } | undefined>(
    undefined,
  );
  const clamp = (value: number) =>
    Math.max(minimumHeight, Math.min(value, maximumHeight));
  return (
    <div
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemax={maximumHeight}
      aria-valuemin={minimumHeight}
      aria-valuenow={height}
      className="timeline-resize-handle"
      onKeyDown={(event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        onHeightChange((current) =>
          clamp(current + (event.key === "ArrowUp" ? 20 : -20)),
        );
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        originRef.current = { height, y: event.clientY };
      }}
      onPointerMove={(event) => {
        const origin = originRef.current;
        if (!origin) return;
        onHeightChange(clamp(origin.height + origin.y - event.clientY));
      }}
      onPointerUp={(event) => {
        if (!originRef.current) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        originRef.current = undefined;
      }}
      role="separator"
      tabIndex={0}
      title={label}
    >
      <span />
    </div>
  );
}
