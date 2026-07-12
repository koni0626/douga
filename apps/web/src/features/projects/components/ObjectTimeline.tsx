import {
  type DragEvent as ReactDragEvent,
  type PointerEvent,
  useEffect,
  useState,
} from "react";

import type { ProjectDocument } from "@douga/project-schema";
import type { LayerEasing } from "@douga/scene-renderer";

import { KeyframePopover, type KeyframeLabels } from "./KeyframePopover";
import { TimelineLayerLabel } from "./TimelineLayerLabel";

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
  onExtend: () => void;
  onPlay: () => void;
  onDeleteKeyframe: (layerId: string, keyframeId: string) => void;
  onDuplicateKeyframe: (
    layerId: string,
    keyframeId: string,
    timeMs: number,
  ) => void;
  onKeyframeEasingChange: (
    layerId: string,
    keyframeId: string,
    easing: LayerEasing,
  ) => void;
  onReorder: (
    sourceIndex: number,
    targetIndex: number,
    position: "before" | "after",
  ) => void;
  onRename: (layerId: string, name?: string) => void;
  onSelect: (layerId: string) => void;
  onSeek: (timeMs: number) => void;
  onStop: () => void;
  collapseLabel: string;
  expandLabel: string;
  extendLabel: string;
  playLabel: string;
  seekLabel: string;
  stopLabel: string;
  title: string;
  renameLabel: string;
  keyframeLabels: KeyframeLabels;
}

export function ObjectTimeline({
  durationMs,
  layers,
  playing,
  selectedLayerId,
  timeMs,
  labelFor,
  onChange,
  onExtend,
  onDeleteKeyframe,
  onDuplicateKeyframe,
  onKeyframeEasingChange,
  onPlay,
  onReorder,
  onRename,
  onSelect,
  onSeek,
  onStop,
  collapseLabel,
  expandLabel,
  extendLabel,
  playLabel,
  seekLabel,
  stopLabel,
  title,
  renameLabel,
  keyframeLabels,
}: ObjectTimelineProps) {
  // SVGは配列の後ろにあるレイヤーほど手前に描画する。
  // タイムラインでは一般的なレイヤーパネルと同様、最前面を上に表示する。
  const displayLayers = [...layers].reverse();
  const [draft, setDraft] = useState<{ layerId: string; range: Range }>();
  const [drag, setDrag] = useState<DragState>();
  const [expanded, setExpanded] = useState(true);
  const [draggedLayerId, setDraggedLayerId] = useState<string>();
  const [dropTarget, setDropTarget] = useState<{
    layerId: string;
    position: "before" | "after";
  }>();
  const [selectedKeyframe, setSelectedKeyframe] = useState<{
    keyframeId: string;
    layerId: string;
    x: number;
    y: number;
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
    // 表示順は描画配列と逆なので、画面上の before/after も反転させる。
    onReorder(
      sourceIndex,
      targetIndex,
      position === "before" ? "after" : "before",
    );
  }

  return (
    <section
      className={
        expanded
          ? "object-timeline"
          : "object-timeline object-timeline--collapsed"
      }
      aria-label={title}
    >
      <header className="object-timeline-header">
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? collapseLabel : expandLabel}
          className="timeline-toggle-button"
          onClick={() => setExpanded((current) => !current)}
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
      {expanded ? (
        <div className="object-timeline-scroll">
          <div
            className="object-timeline-grid"
            style={{
              minWidth: `${9 + Math.max(36, (durationMs / 1000) * 4)}rem`,
            }}
          >
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
            {displayLayers.map((layer) => {
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
                  <TimelineLayerLabel
                    active={selectedLayerId === layer.id}
                    dropClass={dropClass}
                    grabbed={draggedLayerId === layer.id}
                    label={labelFor(layer)}
                    layer={layer}
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
                    onRename={(name) => onRename(layer.id, name)}
                    onSelect={() => onSelect(layer.id)}
                    renameLabel={renameLabel}
                  />
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
                    {(layer.keyframes ?? []).map((keyframe) => (
                      <button
                        type="button"
                        aria-label={`${keyframeLabels.keyframe} ${(keyframe.time_ms / 1000).toFixed(1)}s`}
                        className="object-keyframe-marker"
                        key={keyframe.id}
                        style={{
                          left: `${(keyframe.time_ms * 100) / durationMs}%`,
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelect(layer.id);
                          setSelectedKeyframe({
                            keyframeId: keyframe.id,
                            layerId: layer.id,
                            x: event.clientX + 8,
                            y: event.clientY + 8,
                          });
                        }}
                      />
                    ))}
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
      ) : null}
      {selectedKeyframe
        ? (() => {
            const layer = layers.find(
              (item) => item.id === selectedKeyframe.layerId,
            );
            const keyframe = layer?.keyframes?.find(
              (item) => item.id === selectedKeyframe.keyframeId,
            );
            return layer && keyframe ? (
              <KeyframePopover
                keyframe={keyframe}
                labels={keyframeLabels}
                onClose={() => setSelectedKeyframe(undefined)}
                onDelete={() => {
                  onDeleteKeyframe(layer.id, keyframe.id);
                  setSelectedKeyframe(undefined);
                }}
                onDuplicate={() => {
                  onDuplicateKeyframe(layer.id, keyframe.id, timeMs);
                  setSelectedKeyframe(undefined);
                }}
                onEasingChange={(easing) =>
                  onKeyframeEasingChange(layer.id, keyframe.id, easing)
                }
                x={selectedKeyframe.x}
                y={selectedKeyframe.y}
              />
            ) : null;
          })()
        : null}
    </section>
  );
}
