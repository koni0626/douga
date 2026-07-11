import {
  type DragEvent as ReactDragEvent,
  type PointerEvent,
  useEffect,
  useState,
} from "react";

import type { ProjectDocument } from "@douga/project-schema";

type Layer = ProjectDocument["scenes"][number]["layers"][number];
type Range = { startMs: number; endMs: number };
type DragMode = "move" | "start" | "end";
type DragState = {
  layerId: string;
  initial: Range;
  mode: DragMode;
  originX: number;
  trackWidth: number;
};

const MIN_DURATION_MS = 250;

function layerRange(layer: Layer, durationMs: number): Range {
  return {
    startMs: Math.max(
      0,
      Math.min(layer.start_ms ?? 0, durationMs - MIN_DURATION_MS),
    ),
    endMs: Math.max(
      MIN_DURATION_MS,
      Math.min(layer.end_ms ?? durationMs, durationMs),
    ),
  };
}

function movedRange(
  initial: Range,
  deltaMs: number,
  mode: DragMode,
  durationMs: number,
): Range {
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
      endMs: Math.min(
        durationMs,
        Math.max(initial.endMs + deltaMs, initial.startMs + MIN_DURATION_MS),
      ),
    };
  }
  const length = initial.endMs - initial.startMs;
  const startMs = Math.max(
    0,
    Math.min(initial.startMs + deltaMs, durationMs - length),
  );
  return { startMs, endMs: startMs + length };
}

export interface ObjectTimelineProps {
  durationMs: number;
  layers: Layer[];
  playing: boolean;
  selectedLayerId?: string;
  timeMs: number;
  labelFor: (layer: Layer) => string;
  onChange: (layerId: string, range: Range) => void;
  onPlay: () => void;
  onReorder: (
    sourceIndex: number,
    targetIndex: number,
    position: "before" | "after",
  ) => void;
  onSelect: (layerId: string) => void;
  onSeek: (timeMs: number) => void;
  onStop: () => void;
  playLabel: string;
  seekLabel: string;
  stopLabel: string;
  title: string;
}

export function ObjectTimeline({
  durationMs,
  layers,
  playing,
  selectedLayerId,
  timeMs,
  labelFor,
  onChange,
  onPlay,
  onReorder,
  onSelect,
  onSeek,
  onStop,
  playLabel,
  seekLabel,
  stopLabel,
  title,
}: ObjectTimelineProps) {
  const [draft, setDraft] = useState<{ layerId: string; range: Range }>();
  const [drag, setDrag] = useState<DragState>();
  const [draggedLayerId, setDraggedLayerId] = useState<string>();
  const [dropTarget, setDropTarget] = useState<{
    layerId: string;
    position: "before" | "after";
  }>();
  const seconds = Array.from(
    { length: Math.floor(durationMs / 1000) + 1 },
    (_, index) => index,
  );

  useEffect(() => {
    if (!drag) return;
    const rangeAt = (clientX: number) => {
      const deltaMs = Math.round(
        ((clientX - drag.originX) / drag.trackWidth) * durationMs,
      );
      return movedRange(drag.initial, deltaMs, drag.mode, durationMs);
    };
    const move = (event: globalThis.PointerEvent) => {
      setDraft({ layerId: drag.layerId, range: rangeAt(event.clientX) });
    };
    const finish = (event: globalThis.PointerEvent) => {
      const range = rangeAt(event.clientX);
      setDraft(undefined);
      setDrag(undefined);
      onChange(drag.layerId, {
        startMs: Math.round(range.startMs / 50) * 50,
        endMs: Math.round(range.endMs / 50) * 50,
      });
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
    layer: Layer,
    mode: DragMode,
  ) {
    event.preventDefault();
    event.stopPropagation();
    onSelect(layer.id);
    const track = event.currentTarget.closest<HTMLElement>(
      ".object-timeline-track",
    );
    if (!track) return;
    const initial = layerRange(layer, durationMs);
    setDraft({ layerId: layer.id, range: initial });
    setDrag({
      layerId: layer.id,
      initial,
      mode,
      originX: event.clientX,
      trackWidth: track.getBoundingClientRect().width,
    });
  }

  function seek(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    onSeek(
      Math.max(
        0,
        Math.min(
          durationMs,
          Math.round(
            ((event.clientX - bounds.left) / bounds.width) * durationMs,
          ),
        ),
      ),
    );
  }

  function orderDragOver(event: ReactDragEvent<HTMLElement>, layerId: string) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    setDropTarget({
      layerId,
      position:
        event.clientY < bounds.top + bounds.height / 2 ? "before" : "after",
    });
  }

  function orderDrop(
    event: ReactDragEvent<HTMLElement>,
    targetLayerId: string,
  ) {
    event.preventDefault();
    const sourceLayerId =
      draggedLayerId || event.dataTransfer.getData("application/x-douga-layer");
    const sourceIndex = layers.findIndex((layer) => layer.id === sourceLayerId);
    const targetIndex = layers.findIndex((layer) => layer.id === targetLayerId);
    const position = dropTarget?.position ?? "before";
    setDraggedLayerId(undefined);
    setDropTarget(undefined);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex)
      return;
    onReorder(sourceIndex, targetIndex, position);
  }

  return (
    <section className="object-timeline" aria-label={title}>
      <header className="object-timeline-header">
        <h2>{title}</h2>
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
      <div className="object-timeline-scroll">
        <div className="object-timeline-grid">
          <div className="object-timeline-corner" />
          <div
            aria-label={seekLabel}
            aria-valuemax={durationMs}
            aria-valuemin={0}
            aria-valuenow={Math.round(timeMs)}
            className="object-timeline-ruler"
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                return;
              event.preventDefault();
              onSeek(
                Math.max(
                  0,
                  Math.min(
                    durationMs - 1,
                    timeMs + (event.key === "ArrowRight" ? 50 : -50),
                  ),
                ),
              );
            }}
            onPointerDown={seek}
            role="slider"
            tabIndex={0}
          >
            {seconds.map((second) => (
              <span
                key={second}
                style={{ left: `${(second * 1000 * 100) / durationMs}%` }}
              >
                {second}s
              </span>
            ))}
          </div>
          {layers.length === 0 ? (
            <p className="object-timeline-empty">—</p>
          ) : null}
          {layers.map((layer) => {
            const range =
              draft?.layerId === layer.id
                ? draft.range
                : layerRange(layer, durationMs);
            const dropClass =
              dropTarget?.layerId === layer.id
                ? `object-timeline-drop-${dropTarget.position}`
                : "";
            return (
              <div className="object-timeline-row" key={layer.id}>
                <button
                  type="button"
                  aria-grabbed={draggedLayerId === layer.id}
                  className={[
                    "object-timeline-label",
                    selectedLayerId === layer.id
                      ? "object-timeline-label--active"
                      : "",
                    layer.locked ? "object-timeline-label--locked" : "",
                    dropClass,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  draggable={!layer.locked}
                  onDragEnd={() => {
                    setDraggedLayerId(undefined);
                    setDropTarget(undefined);
                  }}
                  onDragOver={(event) => orderDragOver(event, layer.id)}
                  onDragStart={(event) => {
                    setDraggedLayerId(layer.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData(
                      "application/x-douga-layer",
                      layer.id,
                    );
                  }}
                  onDrop={(event) => orderDrop(event, layer.id)}
                  onClick={() => onSelect(layer.id)}
                >
                  <span
                    className={`object-type-dot object-type-dot--${layer.type}`}
                  />
                  {labelFor(layer)}
                </button>
                <div
                  className={["object-timeline-track", dropClass]
                    .filter(Boolean)
                    .join(" ")}
                  onDragOver={(event) => orderDragOver(event, layer.id)}
                  onDrop={(event) => orderDrop(event, layer.id)}
                  onPointerDown={seek}
                >
                  <div
                    className={[
                      "object-timeline-clip",
                      selectedLayerId === layer.id
                        ? "object-timeline-clip--active"
                        : "",
                      layer.locked ? "object-timeline-clip--locked" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{
                      left: `${(range.startMs * 100) / durationMs}%`,
                      width: `${((range.endMs - range.startMs) * 100) / durationMs}%`,
                    }}
                    onPointerDown={(event) => {
                      if (layer.locked) {
                        event.stopPropagation();
                        onSelect(layer.id);
                        return;
                      }
                      const bounds =
                        event.currentTarget.getBoundingClientRect();
                      const edgeSize = 14;
                      const mode =
                        event.clientX - bounds.left <= edgeSize
                          ? "start"
                          : bounds.right - event.clientX <= edgeSize
                            ? "end"
                            : "move";
                      beginDrag(event, layer, mode);
                    }}
                  >
                    <div
                      aria-label="start"
                      className="object-timeline-handle object-timeline-handle--start"
                    />
                    <span>{labelFor(layer)}</span>
                    <div
                      aria-label="end"
                      className="object-timeline-handle object-timeline-handle--end"
                    />
                  </div>
                </div>
              </div>
            );
          })}
          <div className="object-timeline-playhead-area">
            <div
              className="object-timeline-playhead"
              style={{ left: `${(timeMs * 100) / durationMs}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
