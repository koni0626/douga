import type { DragEvent as ReactDragEvent, PointerEvent } from "react";

import type { ProjectDocument } from "@douga/project-schema";

import {
  formatTimelineTime,
  type TimelineDragMode,
  type TimelineRange,
} from "../lib/timelineRange";
import type { KeyframeLabels } from "./KeyframePopover";
import { TimelineLayerLabel } from "./TimelineLayerLabel";

type Layer = ProjectDocument["scenes"][number]["layers"][number];

export interface LayerTimelineRowProps {
  beginDrag: (
    event: PointerEvent<HTMLDivElement>,
    layer: Layer,
    mode: TimelineDragMode,
  ) => void;
  displayRow: number;
  draftRange?: TimelineRange;
  dropClass: string;
  durationMs: number;
  grabbed: boolean;
  isRepresentative: boolean;
  keyframeLabels: KeyframeLabels;
  label: string;
  layer: Layer;
  onDragEnd: () => void;
  onDragOver: (event: ReactDragEvent<HTMLElement>, layerId: string) => void;
  onDragStart: (layerId: string) => void;
  onDrop: (event: ReactDragEvent<HTMLElement>, layerId: string) => void;
  onOpenClipMenu: (x: number, y: number) => void;
  onOpenKeyframe: (keyframeId: string, x: number, y: number) => void;
  onRename: (name?: string) => void;
  onSeek: (timeMs: number) => void;
  onSelect: () => void;
  range: TimelineRange;
  renameLabel: string;
  selected: boolean;
  trackSelected: boolean;
}

export function LayerTimelineRow({
  beginDrag,
  displayRow,
  draftRange,
  dropClass,
  durationMs,
  grabbed,
  isRepresentative,
  keyframeLabels,
  label,
  layer,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDrop,
  onOpenClipMenu,
  onOpenKeyframe,
  onRename,
  onSeek,
  onSelect,
  range,
  renameLabel,
  selected,
  trackSelected,
}: LayerTimelineRowProps) {
  return (
    <div className="object-timeline-row">
      {isRepresentative ? (
        <TimelineLayerLabel
          active={trackSelected}
          dropClass={dropClass}
          grabbed={grabbed}
          label={label}
          layer={layer}
          onDragEnd={onDragEnd}
          onDragOver={(event) => onDragOver(event, layer.id)}
          onDragStart={(event) => {
            onDragStart(layer.id);
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("application/x-douga-layer", layer.id);
          }}
          onDrop={(event) => onDrop(event, layer.id)}
          onRename={onRename}
          onSelect={onSelect}
          renameLabel={renameLabel}
          style={{ gridColumn: 1, gridRow: displayRow }}
        />
      ) : null}
      <div
        className={[
          "object-timeline-track",
          isRepresentative ? "object-timeline-track--base" : "",
          dropClass,
        ]
          .filter(Boolean)
          .join(" ")}
        onDragOver={(event) => onDragOver(event, layer.id)}
        onDrop={(event) => onDrop(event, layer.id)}
        onPointerDown={(event) => seek(event, durationMs, onSeek)}
        style={{ gridColumn: 2, gridRow: displayRow }}
      >
        <div
          className={[
            "object-timeline-clip",
            selected ? "object-timeline-clip--active" : "",
            layer.locked ? "object-timeline-clip--locked" : "",
            draftRange ? "object-timeline-clip--dragging" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{
            left: `${(range.startMs * 100) / durationMs}%`,
            width: `${((range.endMs - range.startMs) * 100) / durationMs}%`,
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onSelect();
            onOpenClipMenu(event.clientX, event.clientY);
          }}
          onPointerDown={(event) => {
            if (layer.locked) {
              event.stopPropagation();
              onSelect();
              return;
            }
            const bounds = event.currentTarget.getBoundingClientRect();
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
          <div className="object-timeline-handle object-timeline-handle--start" />
          <span>{label}</span>
          {draftRange ? (
            <output aria-live="polite" className="timeline-drag-time">
              {formatTimelineTime(range.startMs)} –{" "}
              {formatTimelineTime(range.endMs)}
            </output>
          ) : null}
          <div className="object-timeline-handle object-timeline-handle--end" />
        </div>
        {(layer.keyframes ?? []).map((keyframe) => (
          <button
            type="button"
            aria-label={`${keyframeLabels.keyframe} ${(keyframe.time_ms / 1000).toFixed(1)}s`}
            className="object-keyframe-marker"
            key={keyframe.id}
            style={{ left: `${(keyframe.time_ms * 100) / durationMs}%` }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onSelect();
              onOpenKeyframe(keyframe.id, event.clientX + 8, event.clientY + 8);
            }}
          />
        ))}
      </div>
    </div>
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
