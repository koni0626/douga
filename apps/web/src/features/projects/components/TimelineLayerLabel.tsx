import {
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent,
  useState,
} from "react";

import type { ProjectDocument } from "@douga/project-schema";

type Layer = ProjectDocument["scenes"][number]["layers"][number];

interface TimelineLayerLabelProps {
  active: boolean;
  dropClass: string;
  grabbed: boolean;
  label: string;
  layer: Layer;
  onDragEnd: () => void;
  onDragOver: (event: ReactDragEvent<HTMLElement>) => void;
  onDragStart: (event: ReactDragEvent<HTMLElement>) => void;
  onDrop: (event: ReactDragEvent<HTMLElement>) => void;
  onRename: (name?: string) => void;
  onSelect: () => void;
  renameLabel: string;
  style?: CSSProperties;
}

export function TimelineLayerLabel({
  active,
  dropClass,
  grabbed,
  label,
  layer,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDrop,
  onRename,
  onSelect,
  renameLabel,
  style,
}: TimelineLayerLabelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const className = [
    "object-timeline-label",
    active ? "object-timeline-label--active" : "",
    layer.locked ? "object-timeline-label--locked" : "",
    editing ? "object-timeline-label--editing" : "",
    dropClass,
  ]
    .filter(Boolean)
    .join(" ");

  function beginRename() {
    setDraft(layer.name ?? label);
    setEditing(true);
    onSelect();
  }

  function commitRename() {
    onRename(draft.trim() || undefined);
    setEditing(false);
  }

  function handleRenameKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <div className={className}>
        <span className={`object-type-dot object-type-dot--${layer.type}`} />
        <input
          autoFocus
          aria-label={renameLabel}
          className="object-timeline-name-input"
          maxLength={200}
          value={draft}
          onBlur={commitRename}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleRenameKey}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-grabbed={grabbed}
      className={className}
      draggable={!layer.locked}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragStart={onDragStart}
      onDrop={onDrop}
      onClick={onSelect}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        beginRename();
      }}
      title={renameLabel}
      style={style}
    >
      <span className={`object-type-dot object-type-dot--${layer.type}`} />
      {label}
    </button>
  );
}
