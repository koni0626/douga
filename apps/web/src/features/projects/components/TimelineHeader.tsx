import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  TimelineRangeControls,
  type TimelineRangeControlsProps,
} from "./TimelineRangeControls";

export interface TimelineHeaderProps {
  collapseLabel: string;
  cutDisabled: boolean;
  cutLabel: string;
  expandLabel: string;
  expanded: boolean;
  height: number;
  maximumHeight: number;
  minimumHeight: number;
  onCut: () => void;
  onHeightChange: Dispatch<SetStateAction<number>>;
  onPlay: () => void;
  onStop: () => void;
  onToggle: () => void;
  playLabel: string;
  playing: boolean;
  resizeLabel: string;
  rangeControls: TimelineRangeControlsProps;
  stopLabel: string;
  timeMs: number;
  durationMs: number;
  durationInputLabel: string;
  onDurationChange: (durationMs: number) => void;
  title: string;
}

export function TimelineHeader({
  collapseLabel,
  cutDisabled,
  cutLabel,
  expandLabel,
  expanded,
  height,
  maximumHeight,
  minimumHeight,
  onCut,
  onHeightChange,
  onPlay,
  onStop,
  onToggle,
  playLabel,
  playing,
  resizeLabel,
  rangeControls,
  stopLabel,
  timeMs,
  durationMs,
  durationInputLabel,
  onDurationChange,
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
          className="timeline-cut-button"
          aria-label={cutLabel}
          disabled={cutDisabled}
          title={cutLabel}
          onClick={onCut}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="6" cy="7" r="3" />
            <circle cx="6" cy="17" r="3" />
            <path d="m8.6 8.5 10.4 6M8.6 15.5 19 9" />
          </svg>
          <span>{cutLabel}</span>
        </button>
        <TimelineRangeControls {...rangeControls} />
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
        <span className="timeline-playback-time">
          {(timeMs / 1000).toFixed(1)}s / {(durationMs / 1000).toFixed(1)}s
        </span>
        <TimelineDurationInput
          durationMs={durationMs}
          label={durationInputLabel}
          onChange={onDurationChange}
        />
      </header>
    </>
  );
}

interface TimelineDurationInputProps {
  durationMs: number;
  label: string;
  onChange: (durationMs: number) => void;
}

function TimelineDurationInput({
  durationMs,
  label,
  onChange,
}: TimelineDurationInputProps) {
  const [draft, setDraft] = useState((durationMs / 1000).toFixed(2));
  useEffect(() => setDraft((durationMs / 1000).toFixed(2)), [durationMs]);

  function commit() {
    const seconds = Number(draft);
    if (!Number.isFinite(seconds)) {
      setDraft((durationMs / 1000).toFixed(2));
      return;
    }
    onChange(Math.round(seconds) * 1000);
  }

  return (
    <label className="timeline-duration-input">
      <span>{label}</span>
      <input
        aria-label={label}
        max={3600}
        min={1}
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        step={1}
        type="number"
        value={draft}
      />
      <span>s</span>
    </label>
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
