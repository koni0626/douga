import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
  useEffect,
  useState,
} from "react";

import type { CaptionTimelineClip } from "../lib/captionTimeline";

type Range = { startMs: number; endMs: number };
type DragMode = "move" | "start" | "end";
type DragState = {
  captionId: string;
  initial: Range;
  mode: DragMode;
  originX: number;
  trackWidth: number;
};
type CaptionMenu = { captionId: string; x: number; y: number };

const MIN_DURATION_MS = 250;

function movedRange(initial: Range, deltaMs: number, mode: DragMode): Range {
  if (mode === "start") {
    return {
      ...initial,
      startMs: Math.max(
        0,
        Math.min(initial.startMs + deltaMs, initial.endMs - MIN_DURATION_MS),
      ),
    };
  }
  if (mode === "end") {
    return {
      ...initial,
      endMs: Math.max(
        initial.startMs + MIN_DURATION_MS,
        initial.endMs + deltaMs,
      ),
    };
  }
  const length = initial.endMs - initial.startMs;
  const startMs = Math.max(0, initial.startMs + deltaMs);
  return { startMs, endMs: startMs + length };
}

function timeAt(
  event: ReactMouseEvent<HTMLElement>,
  durationMs: number,
): number {
  const bounds = event.currentTarget.getBoundingClientRect();
  return Math.max(
    0,
    Math.round(((event.clientX - bounds.left) / bounds.width) * durationMs),
  );
}

export interface CaptionTimelineTrackProps {
  addLabel: string;
  captions: CaptionTimelineClip[];
  deleteLabel: string;
  durationMs: number;
  emptyLabel: string;
  formatDuration: (durationMs: number) => string;
  inputLabel: string;
  label: string;
  onAdd: (startMs: number) => void;
  onChange: (captionId: string, range: Range) => void;
  onDelete: (captionId: string) => void;
  onOpenSettings: () => void;
  onSeek: (timeMs: number) => void;
  onTextChange: (captionId: string, text: string) => void;
  settingsLabel: string;
  timeMs: number;
}

export function CaptionTimelineTrack({
  addLabel,
  captions,
  deleteLabel,
  durationMs,
  emptyLabel,
  formatDuration,
  inputLabel,
  label,
  onAdd,
  onChange,
  onDelete,
  onOpenSettings,
  onSeek,
  onTextChange,
  settingsLabel,
  timeMs,
}: CaptionTimelineTrackProps) {
  const [drag, setDrag] = useState<DragState>();
  const [draft, setDraft] = useState<{
    captionId: string;
    range: Range;
  }>();
  const [menu, setMenu] = useState<CaptionMenu>();

  useEffect(() => {
    if (!drag) return;
    const rangeAt = (clientX: number) => {
      const deltaMs = Math.round(
        ((clientX - drag.originX) / drag.trackWidth) * durationMs,
      );
      return movedRange(drag.initial, deltaMs, drag.mode);
    };
    const move = (event: globalThis.PointerEvent) =>
      setDraft({ captionId: drag.captionId, range: rangeAt(event.clientX) });
    const finish = (event: globalThis.PointerEvent) => {
      const range = rangeAt(event.clientX);
      onChange(drag.captionId, {
        startMs: Math.round(range.startMs / 50) * 50,
        endMs: Math.round(range.endMs / 50) * 50,
      });
      setDraft(undefined);
      setDrag(undefined);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
    };
  }, [drag, durationMs, onChange]);

  function beginDrag(
    event: PointerEvent<HTMLDivElement>,
    caption: CaptionTimelineClip,
  ) {
    if (
      event.target instanceof Element &&
      event.target.closest("input, button")
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const track = event.currentTarget.parentElement;
    if (!track) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const edgeSize = 12;
    const mode =
      event.clientX - bounds.left <= edgeSize
        ? "start"
        : bounds.right - event.clientX <= edgeSize
          ? "end"
          : "move";
    const initial = { startMs: caption.startMs, endMs: caption.endMs };
    setDraft({ captionId: caption.id, range: initial });
    setDrag({
      captionId: caption.id,
      initial,
      mode,
      originX: event.clientX,
      trackWidth: track.getBoundingClientRect().width,
    });
  }

  return (
    <>
      <div
        className="object-timeline-label caption-timeline-label"
        style={{ gridColumn: 1, gridRow: 2 }}
      >
        <span className="caption-track-icon" aria-hidden="true">
          T
        </span>
        <span>{label}</span>
        <button
          type="button"
          aria-label={addLabel}
          title={addLabel}
          onClick={() => onAdd(timeMs)}
        >
          ＋
        </button>
      </div>
      <div
        className="object-timeline-track object-timeline-track--base caption-timeline-track"
        style={{ gridColumn: 2, gridRow: 2 }}
        onDoubleClick={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest(".caption-timeline-clip")
          )
            return;
          onAdd(timeAt(event, durationMs));
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          onSeek(
            Math.max(
              0,
              Math.min(
                durationMs - 1,
                Math.round(
                  ((event.clientX - bounds.left) / bounds.width) * durationMs,
                ),
              ),
            ),
          );
        }}
      >
        {captions.length === 0 ? (
          <span className="caption-timeline-empty">{emptyLabel}</span>
        ) : null}
        {captions.map((caption) => {
          const range =
            draft?.captionId === caption.id
              ? draft.range
              : { startMs: caption.startMs, endMs: caption.endMs };
          return (
            <div
              className={
                draft?.captionId === caption.id
                  ? "caption-timeline-clip caption-timeline-clip--dragging"
                  : "caption-timeline-clip"
              }
              key={caption.id}
              style={{
                left: `${(range.startMs * 100) / durationMs}%`,
                width: `${((range.endMs - range.startMs) * 100) / durationMs}%`,
              }}
              title={`${(range.startMs / 1000).toFixed(1)}s – ${(range.endMs / 1000).toFixed(1)}s`}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setMenu({
                  captionId: caption.id,
                  x: Math.min(event.clientX, globalThis.innerWidth - 220),
                  y: Math.min(event.clientY, globalThis.innerHeight - 110),
                });
              }}
              onPointerDown={(event) => beginDrag(event, caption)}
            >
              <span className="object-timeline-handle object-timeline-handle--start" />
              <input
                aria-label={inputLabel}
                value={caption.text}
                onChange={(event) =>
                  onTextChange(caption.id, event.target.value)
                }
                onPointerDown={(event) => event.stopPropagation()}
              />
              <output>{formatDuration(range.endMs - range.startMs)}</output>
              {draft?.captionId === caption.id ? (
                <output className="timeline-drag-time" aria-live="polite">
                  {(range.startMs / 1000).toFixed(2)}s –{" "}
                  {(range.endMs / 1000).toFixed(2)}s
                </output>
              ) : null}
              <span className="object-timeline-handle object-timeline-handle--end" />
            </div>
          );
        })}
      </div>
      {menu ? (
        <div
          className="timeline-clip-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onOpenSettings();
              setMenu(undefined);
            }}
          >
            {settingsLabel}
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => {
              onDelete(menu.captionId);
              setMenu(undefined);
            }}
          >
            {deleteLabel}
          </button>
        </div>
      ) : null}
    </>
  );
}
