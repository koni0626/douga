import { useEffect, useRef, useState } from "react";

import type { ProjectDocument } from "@douga/project-schema";
import { SceneRenderer } from "@douga/scene-renderer";

type DropPosition = "before" | "after";

type ContextMenuState = {
  sceneIndex?: number;
  x: number;
  y: number;
};

export function SceneThumbnailList({
  assetUrl,
  addLabel,
  deleteLabel,
  duplicateLabel,
  onDelete,
  onDuplicate,
  onAdd,
  onReorder,
  onSelect,
  project,
  selectedSceneIndex,
}: {
  assetUrl: (assetId: string) => string | undefined;
  addLabel: string;
  deleteLabel: string;
  duplicateLabel: string;
  onDelete: (sceneIndex: number) => void;
  onDuplicate: (sceneIndex: number) => void;
  onAdd: () => void;
  onReorder: (
    sourceIndex: number,
    targetIndex: number,
    position: DropPosition,
  ) => void;
  onSelect: (sceneIndex: number) => void;
  project: ProjectDocument;
  selectedSceneIndex: number;
}) {
  const [dragSourceIndex, setDragSourceIndex] = useState<number>();
  const [dropTarget, setDropTarget] = useState<{
    index: number;
    position: DropPosition;
  }>();
  const [contextMenu, setContextMenu] = useState<ContextMenuState>();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setContextMenu(undefined);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(undefined);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  function openContextMenu(
    sceneIndex: number | undefined,
    x: number,
    y: number,
  ) {
    if (sceneIndex !== undefined) onSelect(sceneIndex);
    setContextMenu({
      sceneIndex,
      x: Math.min(x, window.innerWidth - 180),
      y: Math.min(y, window.innerHeight - 170),
    });
  }

  return (
    <>
      <div
        className="scene-thumbnail-list"
        role="list"
        onContextMenu={(event) => {
          event.preventDefault();
          openContextMenu(undefined, event.clientX, event.clientY);
        }}
      >
        {project.scenes.map((scene, index) => {
          const dropClass =
            dropTarget?.index === index
              ? ` scene-thumbnail-item--drop-${dropTarget.position}`
              : "";
          return (
            <div
              className={`scene-thumbnail-item${dropClass}`}
              draggable
              key={scene.id}
              role="listitem"
              onDragStart={(event) => {
                setDragSourceIndex(index);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", scene.id);
              }}
              onDragEnd={() => {
                setDragSourceIndex(undefined);
                setDropTarget(undefined);
              }}
              onDragOver={(event) => {
                if (dragSourceIndex === undefined) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const bounds = event.currentTarget.getBoundingClientRect();
                setDropTarget({
                  index,
                  position:
                    event.clientY < bounds.top + bounds.height / 2
                      ? "before"
                      : "after",
                });
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragSourceIndex !== undefined && dropTarget) {
                  onReorder(
                    dragSourceIndex,
                    dropTarget.index,
                    dropTarget.position,
                  );
                }
                setDragSourceIndex(undefined);
                setDropTarget(undefined);
              }}
            >
              <button
                type="button"
                aria-label={`${index + 1}. ${scene.name}`}
                className={
                  index === selectedSceneIndex
                    ? "scene-thumbnail-card scene-thumbnail-card--active"
                    : "scene-thumbnail-card"
                }
                onClick={() => onSelect(index)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openContextMenu(index, event.clientX, event.clientY);
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === "ContextMenu" ||
                    (event.shiftKey && event.key === "F10")
                  ) {
                    event.preventDefault();
                    const bounds = event.currentTarget.getBoundingClientRect();
                    openContextMenu(index, bounds.left + 24, bounds.top + 24);
                  }
                }}
              >
                <span className="scene-thumbnail-preview" aria-hidden="true">
                  <SceneRenderer
                    project={project}
                    sceneIndex={index}
                    timeMs={0}
                    assetUrl={assetUrl}
                  />
                </span>
                <span className="scene-thumbnail-caption">
                  <span className="scene-thumbnail-number">{index + 1}</span>
                  <span>{scene.name}</span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
      {contextMenu ? (
        <div
          className="scene-context-menu"
          ref={menuRef}
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onAdd();
              setContextMenu(undefined);
            }}
          >
            {addLabel}
          </button>
          {contextMenu.sceneIndex !== undefined ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const sceneIndex = contextMenu.sceneIndex;
                  if (sceneIndex !== undefined) onDuplicate(sceneIndex);
                  setContextMenu(undefined);
                }}
              >
                {duplicateLabel}
              </button>
              <button
                type="button"
                className="danger"
                role="menuitem"
                onClick={() => {
                  const sceneIndex = contextMenu.sceneIndex;
                  if (sceneIndex !== undefined) onDelete(sceneIndex);
                  setContextMenu(undefined);
                }}
              >
                {deleteLabel}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
