import { type PointerEvent, useEffect, useState } from "react";

import type { ProjectDocument } from "@douga/project-schema";
import type { LayerEasing } from "@douga/scene-renderer";

import { timelineMenuPosition } from "../lib/timelineMenuPosition";
import {
  MIN_TIMELINE_CLIP_DURATION_MS,
  moveTimelineRange,
  snapTimelineRange,
  type TimelineDragMode,
  type TimelineRange,
} from "../lib/timelineRange";
import type { KeyframeLabels } from "./KeyframePopover";
import {
  LayerClipMenu,
  LayerKeyframeMenu,
  type SelectedLayerKeyframe,
} from "./LayerTimelineMenus";
import { LayerTimelineRow } from "./LayerTimelineRow";

type Layer = ProjectDocument["scenes"][number]["layers"][number];
type DragState = {
  layerId: string;
  initial: TimelineRange;
  mode: TimelineDragMode;
  originX: number;
  originY: number;
  trackLeft: number;
  trackWidth: number;
};
type ClipMenu = { layerId: string; x: number; y: number };
type OrderDragState = {
  layerId: string;
  originX: number;
  originY: number;
};

export interface LayerTimelineTracksProps {
  audioTrackCount: number;
  durationMs: number;
  keyframeLabels: KeyframeLabels;
  labelFor: (layer: Layer) => string;
  layers: Layer[];
  mergeAboveLabel: string;
  mergeBelowLabel: string;
  onChange: (layerId: string, range: TimelineRange) => void;
  onDeleteKeyframe: (layerId: string, keyframeId: string) => void;
  onDeleteLayer: (layerId: string) => void;
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
  onMergeTrack: (sourceLayerId: string, targetLayerId: string) => void;
  onMoveToTrack: (
    layerId: string,
    targetLayerId: string,
    range: TimelineRange,
  ) => void;
  onOpenSettings: () => void;
  onRename: (layerId: string, name?: string) => void;
  onReorder: (
    sourceIndex: number,
    targetIndex: number,
    position: "before" | "after",
  ) => void;
  onSeek: (timeMs: number) => void;
  onSelect: (layerId: string) => void;
  onSplitTrack: (layerId: string) => void;
  renameLabel: string;
  selectedLayerId?: string;
  settingsLabel: string;
  deleteLabel: string;
  splitTrackLabel: string;
  timeMs: number;
}

function trackId(layer: Layer): string {
  return layer.track_id ?? layer.id;
}

function layerRange(layer: Layer, durationMs: number): TimelineRange {
  return {
    startMs: Math.max(
      0,
      Math.min(layer.start_ms ?? 0, durationMs - MIN_TIMELINE_CLIP_DURATION_MS),
    ),
    endMs: Math.max(
      MIN_TIMELINE_CLIP_DURATION_MS,
      Math.min(layer.end_ms ?? durationMs, durationMs),
    ),
  };
}

export function LayerTimelineTracks(props: LayerTimelineTracksProps) {
  const {
    audioTrackCount,
    durationMs,
    keyframeLabels,
    labelFor,
    layers,
    onChange,
    onDeleteKeyframe,
    onDeleteLayer,
    onDuplicateKeyframe,
    onKeyframeEasingChange,
    onMergeTrack,
    onMoveToTrack,
    onOpenSettings,
    onRename,
    onReorder,
    onSeek,
    onSelect,
    onSplitTrack,
    renameLabel,
    selectedLayerId,
    timeMs,
    deleteLabel,
  } = props;
  const displayLayers = [...layers].reverse();
  const displayTrackIds = Array.from(
    new Set(displayLayers.map((layer) => trackId(layer))),
  );
  const trackCounts = layers.reduce<Map<string, number>>((counts, layer) => {
    const id = trackId(layer);
    counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  }, new Map());
  const [draft, setDraft] = useState<{
    layerId: string;
    range: TimelineRange;
  }>();
  const [drag, setDrag] = useState<DragState>();
  const [draggedLayerId, setDraggedLayerId] = useState<string>();
  const [orderDrag, setOrderDrag] = useState<OrderDragState>();
  const [clipDropTargetId, setClipDropTargetId] = useState<string>();
  const [dropTarget, setDropTarget] = useState<{
    layerId: string;
    position: "before" | "after";
  }>();
  const [selectedKeyframe, setSelectedKeyframe] =
    useState<SelectedLayerKeyframe>();
  const [clipMenu, setClipMenu] = useState<ClipMenu>();

  useEffect(() => {
    if (!drag) return;
    const rangeAt = (clientX: number) => {
      const deltaMs = Math.round(
        ((clientX - drag.originX) / drag.trackWidth) * durationMs,
      );
      return moveTimelineRange(drag.initial, deltaMs, drag.mode, {
        durationMs,
      });
    };
    const targetAt = (event: globalThis.PointerEvent) => {
      if (drag.mode !== "move") return undefined;
      return document
        .elementsFromPoint(event.clientX, event.clientY)
        .map((element) =>
          element.closest<HTMLElement>("[data-timeline-track-target]"),
        )
        .find(Boolean)?.dataset.timelineTrackTarget;
    };
    const move = (event: globalThis.PointerEvent) => {
      setDraft({ layerId: drag.layerId, range: rangeAt(event.clientX) });
      setClipDropTargetId(targetAt(event));
    };
    const finish = (event: globalThis.PointerEvent) => {
      const moved =
        Math.abs(event.clientX - drag.originX) >= 4 ||
        Math.abs(event.clientY - drag.originY) >= 4;
      if (!moved) {
        onSeek(
          Math.max(
            0,
            Math.min(
              durationMs - 1,
              Math.round(
                ((drag.originX - drag.trackLeft) / drag.trackWidth) *
                  durationMs,
              ),
            ),
          ),
        );
        setDraft(undefined);
        setDrag(undefined);
        setClipDropTargetId(undefined);
        return;
      }
      const range = snapTimelineRange(rangeAt(event.clientX));
      const targetLayerId = targetAt(event);
      if (targetLayerId && targetLayerId !== drag.layerId)
        onMoveToTrack(drag.layerId, targetLayerId, range);
      else onChange(drag.layerId, range);
      setDraft(undefined);
      setDrag(undefined);
      setClipDropTargetId(undefined);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
    };
  }, [drag, durationMs, onChange, onMoveToTrack, onSeek]);

  useEffect(() => {
    if (!orderDrag) return;
    const targetAt = (event: globalThis.PointerEvent) => {
      const target = document
        .elementsFromPoint(event.clientX, event.clientY)
        .map((element) =>
          element.closest<HTMLElement>("[data-layer-order-target]"),
        )
        .find(Boolean);
      if (!target) return undefined;
      const bounds = target.getBoundingClientRect();
      return {
        layerId: target.dataset.layerOrderTarget,
        position:
          event.clientY < bounds.top + bounds.height / 2
            ? ("before" as const)
            : ("after" as const),
      };
    };
    const moved = (event: globalThis.PointerEvent) =>
      Math.abs(event.clientX - orderDrag.originX) >= 4 ||
      Math.abs(event.clientY - orderDrag.originY) >= 4;
    const move = (event: globalThis.PointerEvent) => {
      if (!moved(event)) return;
      const target = targetAt(event);
      setDropTarget(
        target?.layerId
          ? { layerId: target.layerId, position: target.position }
          : undefined,
      );
    };
    const finish = (event: globalThis.PointerEvent) => {
      const target = moved(event) ? targetAt(event) : undefined;
      const sourceIndex = layers.findIndex(
        (layer) => layer.id === orderDrag.layerId,
      );
      const targetIndex = layers.findIndex(
        (layer) => layer.id === target?.layerId,
      );
      if (
        target &&
        sourceIndex >= 0 &&
        targetIndex >= 0 &&
        sourceIndex !== targetIndex
      )
        onReorder(
          sourceIndex,
          targetIndex,
          target.position === "before" ? "after" : "before",
        );
      setOrderDrag(undefined);
      setDraggedLayerId(undefined);
      setDropTarget(undefined);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
    };
  }, [layers, onReorder, orderDrag]);

  function beginDrag(
    event: PointerEvent<HTMLDivElement>,
    layer: Layer,
    mode: TimelineDragMode,
  ) {
    event.preventDefault();
    event.stopPropagation();
    onSelect(layer.id);
    const track = event.currentTarget.closest<HTMLElement>(
      ".object-timeline-track",
    );
    if (!track) return;
    const trackBounds = track.getBoundingClientRect();
    const initial = layerRange(layer, durationMs);
    setDraft({ layerId: layer.id, range: initial });
    setClipDropTargetId(undefined);
    setDrag({
      layerId: layer.id,
      initial,
      mode,
      originX: event.clientX,
      originY: event.clientY,
      trackLeft: trackBounds.left,
      trackWidth: trackBounds.width,
    });
  }

  function beginOrderDrag(
    event: PointerEvent<HTMLButtonElement>,
    layer: Layer,
  ) {
    if (event.button !== 0 || layer.locked) return;
    event.stopPropagation();
    onSelect(layer.id);
    setDraggedLayerId(layer.id);
    setOrderDrag({
      layerId: layer.id,
      originX: event.clientX,
      originY: event.clientY,
    });
  }

  return (
    <>
      {displayLayers.map((layer) => {
        const layerTrackId = trackId(layer);
        const trackIndex = displayTrackIds.indexOf(layerTrackId);
        const trackLayers = displayLayers.filter(
          (item) => trackId(item) === layerTrackId,
        );
        const isRepresentative = trackLayers[0]?.id === layer.id;
        const range =
          draft?.layerId === layer.id
            ? draft.range
            : layerRange(layer, durationMs);
        const dropClass =
          dropTarget?.layerId === layer.id
            ? `object-timeline-drop-${dropTarget.position}`
            : "";
        return (
          <LayerTimelineRow
            beginDrag={beginDrag}
            clipDropTarget={clipDropTargetId === layer.id}
            displayRow={trackIndex + audioTrackCount + 4}
            draftRange={draft?.layerId === layer.id ? range : undefined}
            dropClass={dropClass}
            durationMs={durationMs}
            grabbed={draggedLayerId === layer.id}
            isRepresentative={isRepresentative}
            key={layer.id}
            keyframeLabels={keyframeLabels}
            label={`${labelFor(layer)}${trackLayers.length > 1 ? ` (${trackLayers.length})` : ""}`}
            layer={layer}
            onOrderPointerDown={beginOrderDrag}
            onOpenClipMenu={(x, y) =>
              setClipMenu({
                layerId: layer.id,
                ...timelineMenuPosition(x, y, 4),
              })
            }
            onOpenKeyframe={(keyframeId, x, y) =>
              setSelectedKeyframe({ keyframeId, layerId: layer.id, x, y })
            }
            onRename={(name) => onRename(layer.id, name)}
            onSeek={onSeek}
            onSelect={() => onSelect(layer.id)}
            range={range}
            renameLabel={renameLabel}
            selected={selectedLayerId === layer.id}
            trackSelected={trackLayers.some(
              (item) => item.id === selectedLayerId,
            )}
            trackTargetLayerId={isRepresentative ? layer.id : undefined}
          />
        );
      })}
      <LayerKeyframeMenu
        keyframeLabels={keyframeLabels}
        layers={layers}
        onClose={() => setSelectedKeyframe(undefined)}
        onDelete={onDeleteKeyframe}
        onDuplicate={onDuplicateKeyframe}
        onEasingChange={onKeyframeEasingChange}
        selected={selectedKeyframe}
        timeMs={timeMs}
      />
      <LayerClipMenu
        clipMenu={clipMenu}
        deleteLabel={deleteLabel}
        displayLayers={displayLayers}
        displayTrackIds={displayTrackIds}
        layers={layers}
        mergeAboveLabel={props.mergeAboveLabel}
        mergeBelowLabel={props.mergeBelowLabel}
        onClose={() => setClipMenu(undefined)}
        onDeleteLayer={onDeleteLayer}
        onMergeTrack={onMergeTrack}
        onOpenSettings={onOpenSettings}
        onSplitTrack={onSplitTrack}
        settingsLabel={props.settingsLabel}
        splitTrackLabel={props.splitTrackLabel}
        trackCounts={trackCounts}
      />
    </>
  );
}
