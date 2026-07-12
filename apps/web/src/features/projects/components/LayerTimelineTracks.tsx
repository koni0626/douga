import {
  type DragEvent as ReactDragEvent,
  type PointerEvent,
  useEffect,
  useState,
} from "react";

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
  trackWidth: number;
};
type ClipMenu = { layerId: string; x: number; y: number };

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
    onDuplicateKeyframe,
    onKeyframeEasingChange,
    onMergeTrack,
    onOpenSettings,
    onRename,
    onReorder,
    onSeek,
    onSelect,
    onSplitTrack,
    renameLabel,
    selectedLayerId,
    timeMs,
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
    const move = (event: globalThis.PointerEvent) =>
      setDraft({ layerId: drag.layerId, range: rangeAt(event.clientX) });
    const finish = (event: globalThis.PointerEvent) => {
      onChange(drag.layerId, snapTimelineRange(rangeAt(event.clientX)));
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
    onReorder(
      sourceIndex,
      targetIndex,
      position === "before" ? "after" : "before",
    );
  }

  return (
    <>
      {displayLayers.map((layer) => {
        const layerTrackId = trackId(layer);
        const trackIndex = displayTrackIds.indexOf(layerTrackId);
        const trackLayers = displayLayers.filter(
          (item) => trackId(item) === layerTrackId,
        );
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
            displayRow={trackIndex + audioTrackCount + 4}
            draftRange={draft?.layerId === layer.id ? range : undefined}
            dropClass={dropClass}
            durationMs={durationMs}
            grabbed={draggedLayerId === layer.id}
            isRepresentative={trackLayers[0]?.id === layer.id}
            keyframeLabels={keyframeLabels}
            label={`${labelFor(layer)}${trackLayers.length > 1 ? ` (${trackLayers.length})` : ""}`}
            layer={layer}
            onDragEnd={() => {
              setDraggedLayerId(undefined);
              setDropTarget(undefined);
            }}
            onDragOver={orderDragOver}
            onDragStart={setDraggedLayerId}
            onDrop={orderDrop}
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
        displayLayers={displayLayers}
        displayTrackIds={displayTrackIds}
        layers={layers}
        mergeAboveLabel={props.mergeAboveLabel}
        mergeBelowLabel={props.mergeBelowLabel}
        onClose={() => setClipMenu(undefined)}
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
