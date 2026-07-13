import type { ProjectDocument } from "@douga/project-schema";
import type { LayerEasing } from "@douga/scene-renderer";

import { useDismissibleMenu } from "../hooks/useDismissibleMenu";
import { KeyframePopover, type KeyframeLabels } from "./KeyframePopover";

type Layer = ProjectDocument["scenes"][number]["layers"][number];

export interface SelectedLayerKeyframe {
  keyframeId: string;
  layerId: string;
  x: number;
  y: number;
}

export interface LayerKeyframeMenuProps {
  keyframeLabels: KeyframeLabels;
  layers: Layer[];
  onClose: () => void;
  onDelete: (layerId: string, keyframeId: string) => void;
  onDuplicate: (layerId: string, keyframeId: string, timeMs: number) => void;
  onEasingChange: (
    layerId: string,
    keyframeId: string,
    easing: LayerEasing,
  ) => void;
  selected?: SelectedLayerKeyframe;
  timeMs: number;
}

export function LayerKeyframeMenu({
  keyframeLabels,
  layers,
  onClose,
  onDelete,
  onDuplicate,
  onEasingChange,
  selected,
  timeMs,
}: LayerKeyframeMenuProps) {
  if (!selected) return null;
  const layer = layers.find((item) => item.id === selected.layerId);
  const keyframe = layer?.keyframes?.find(
    (item) => item.id === selected.keyframeId,
  );
  if (!layer || !keyframe) return null;
  return (
    <KeyframePopover
      keyframe={keyframe}
      labels={keyframeLabels}
      onClose={onClose}
      onDelete={() => {
        onDelete(layer.id, keyframe.id);
        onClose();
      }}
      onDuplicate={() => {
        onDuplicate(layer.id, keyframe.id, timeMs);
        onClose();
      }}
      onEasingChange={(easing) => onEasingChange(layer.id, keyframe.id, easing)}
      x={selected.x}
      y={selected.y}
    />
  );
}

export interface LayerClipMenuProps {
  clipMenu?: { layerId: string; x: number; y: number };
  displayLayers: Layer[];
  displayTrackIds: string[];
  layers: Layer[];
  deleteLabel: string;
  mergeAboveLabel: string;
  mergeBelowLabel: string;
  onClose: () => void;
  onDeleteLayer: (layerId: string) => void;
  onMergeTrack: (sourceLayerId: string, targetLayerId: string) => void;
  onOpenSettings: () => void;
  onSplitTrack: (layerId: string) => void;
  settingsLabel: string;
  splitTrackLabel: string;
  trackCounts: Map<string, number>;
}

export function LayerClipMenu({
  clipMenu,
  displayLayers,
  displayTrackIds,
  layers,
  deleteLabel,
  mergeAboveLabel,
  mergeBelowLabel,
  onClose,
  onDeleteLayer,
  onMergeTrack,
  onOpenSettings,
  onSplitTrack,
  settingsLabel,
  splitTrackLabel,
  trackCounts,
}: LayerClipMenuProps) {
  const menuRef = useDismissibleMenu<HTMLDivElement>(
    Boolean(clipMenu),
    onClose,
  );
  if (!clipMenu) return null;
  const layer = layers.find((item) => item.id === clipMenu.layerId);
  if (!layer) return null;
  const currentTrackIndex = displayTrackIds.indexOf(trackId(layer));
  const targetFor = (id?: string) =>
    id ? displayLayers.find((item) => trackId(item) === id) : undefined;
  const above = targetFor(displayTrackIds[currentTrackIndex - 1]);
  const below = targetFor(displayTrackIds[currentTrackIndex + 1]);
  return (
    <div
      ref={menuRef}
      className="timeline-clip-menu"
      role="menu"
      style={{ left: clipMenu.x, top: clipMenu.y }}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onOpenSettings();
          onClose();
        }}
      >
        {settingsLabel}
      </button>
      {above ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onMergeTrack(layer.id, above.id);
            onClose();
          }}
        >
          {mergeAboveLabel}
        </button>
      ) : null}
      {below ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onMergeTrack(layer.id, below.id);
            onClose();
          }}
        >
          {mergeBelowLabel}
        </button>
      ) : null}
      {(trackCounts.get(trackId(layer)) ?? 0) > 1 ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onSplitTrack(layer.id);
            onClose();
          }}
        >
          {splitTrackLabel}
        </button>
      ) : null}
      <button
        type="button"
        role="menuitem"
        className="danger"
        onClick={() => {
          onDeleteLayer(layer.id);
          onClose();
        }}
      >
        {deleteLabel}
      </button>
    </div>
  );
}

function trackId(layer: Layer): string {
  return layer.track_id ?? layer.id;
}
