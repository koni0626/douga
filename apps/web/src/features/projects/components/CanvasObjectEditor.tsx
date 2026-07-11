import { type PointerEvent, useEffect, useRef } from "react";

import type { ProjectDocument } from "@douga/project-schema";

type Layer = ProjectDocument["scenes"][number]["layers"][number];
export type LayerTransformPatch = Partial<
  Pick<
    Layer,
    "x" | "y" | "width" | "height" | "rotation" | "flip_x" | "flip_y" | "locked"
  >
>;
type Operation = "move" | "resize" | "rotate";
type Point = { x: number; y: number };
type Interaction = {
  layer: Layer;
  operation: Operation;
  start: Point;
  startAngle: number;
};

export interface CanvasObjectEditorProps {
  flipHorizontalLabel: string;
  flipVerticalLabel: string;
  height: number;
  layers: Layer[];
  lockLabel: string;
  lockedLabel: string;
  onCommit: (layerId: string, patch: LayerTransformPatch) => void;
  onPreview: (layerId: string, patch?: LayerTransformPatch) => void;
  onSelect: (layerId: string) => void;
  selectedLayerId?: string;
  unlockLabel: string;
  width: number;
}

function layerTransform(layer: Layer): string {
  const centerX = layer.x + layer.width / 2;
  const centerY = layer.y + layer.height / 2;
  return `rotate(${layer.rotation} ${centerX} ${centerY})`;
}

function LockGlyph({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <g aria-hidden="true" pointerEvents="none">
      <rect
        x={x}
        y={y}
        width={size}
        height={size}
        rx={size * 0.18}
        fill="#071522"
        fillOpacity={0.92}
        stroke="#ffffff"
        strokeWidth={Math.max(2, size * 0.06)}
      />
      <path
        d={`M ${x + size * 0.32} ${y + size * 0.48} V ${y + size * 0.36} A ${size * 0.18} ${size * 0.18} 0 0 1 ${x + size * 0.68} ${y + size * 0.36} V ${y + size * 0.48} M ${x + size * 0.25} ${y + size * 0.48} H ${x + size * 0.75} V ${y + size * 0.78} H ${x + size * 0.25} Z`}
        fill="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={Math.max(2, size * 0.07)}
      />
    </g>
  );
}

export function CanvasObjectEditor({
  flipHorizontalLabel,
  flipVerticalLabel,
  height,
  layers,
  lockLabel,
  lockedLabel,
  onCommit,
  onPreview,
  onSelect,
  selectedLayerId,
  unlockLabel,
  width,
}: CanvasObjectEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const interactionRef = useRef<Interaction | undefined>(undefined);
  const patchRef = useRef<LayerTransformPatch | undefined>(undefined);
  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId);

  function clientPoint(clientX: number, clientY: number): Point {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return {
      x: ((clientX - bounds.left) / bounds.width) * width,
      y: ((clientY - bounds.top) / bounds.height) * height,
    };
  }

  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction) return;
      const point = clientPoint(event.clientX, event.clientY);
      const deltaX = point.x - interaction.start.x;
      const deltaY = point.y - interaction.start.y;
      const layer = interaction.layer;
      let patch: LayerTransformPatch;
      if (interaction.operation === "move") {
        patch = { x: layer.x + deltaX, y: layer.y + deltaY };
      } else if (interaction.operation === "resize") {
        const radians = (-layer.rotation * Math.PI) / 180;
        const localX = deltaX * Math.cos(radians) - deltaY * Math.sin(radians);
        const localY = deltaX * Math.sin(radians) + deltaY * Math.cos(radians);
        const scale = Math.max(
          40 / layer.width,
          40 / layer.height,
          1 + Math.max(localX / layer.width, localY / layer.height),
        );
        patch = {
          width: Math.round(layer.width * scale),
          height: Math.round(layer.height * scale),
        };
      } else {
        const centerX = layer.x + layer.width / 2;
        const centerY = layer.y + layer.height / 2;
        const angle =
          (Math.atan2(point.y - centerY, point.x - centerX) * 180) / Math.PI;
        patch = {
          rotation: Math.round(layer.rotation + angle - interaction.startAngle),
        };
      }
      patchRef.current = patch;
      onPreview(layer.id, patch);
    };
    const finish = () => {
      const interaction = interactionRef.current;
      if (!interaction) return;
      const patch = patchRef.current;
      interactionRef.current = undefined;
      patchRef.current = undefined;
      onPreview(interaction.layer.id, undefined);
      if (patch) onCommit(interaction.layer.id, patch);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
    };
  }, [height, onCommit, onPreview, width]);

  function begin(
    event: PointerEvent<SVGElement>,
    layer: Layer,
    operation: Operation,
  ) {
    event.preventDefault();
    event.stopPropagation();
    onSelect(layer.id);
    if (layer.locked) return;
    const start = clientPoint(event.clientX, event.clientY);
    const centerX = layer.x + layer.width / 2;
    const centerY = layer.y + layer.height / 2;
    interactionRef.current = {
      layer: structuredClone(layer),
      operation,
      start,
      startAngle:
        (Math.atan2(start.y - centerY, start.x - centerX) * 180) / Math.PI,
    };
    patchRef.current = undefined;
  }

  const handleSize = Math.max(14, Math.min(width, height) * 0.018);
  const lockSize = Math.max(28, Math.min(width, height) * 0.045);

  return (
    <>
      {selectedLayer ? (
        <div className="canvas-object-toolbar" role="toolbar">
          <button
            type="button"
            aria-label={flipHorizontalLabel}
            title={flipHorizontalLabel}
            disabled={selectedLayer.locked}
            onClick={() =>
              onCommit(selectedLayer.id, { flip_x: !selectedLayer.flip_x })
            }
          >
            ↔
          </button>
          <button
            type="button"
            aria-label={flipVerticalLabel}
            title={flipVerticalLabel}
            disabled={selectedLayer.locked}
            onClick={() =>
              onCommit(selectedLayer.id, { flip_y: !selectedLayer.flip_y })
            }
          >
            ↕
          </button>
          <button
            type="button"
            aria-label={selectedLayer.locked ? unlockLabel : lockLabel}
            title={selectedLayer.locked ? unlockLabel : lockLabel}
            onClick={() =>
              onCommit(selectedLayer.id, { locked: !selectedLayer.locked })
            }
          >
            {selectedLayer.locked ? "🔓" : "🔒"}
          </button>
        </div>
      ) : null}
      <svg
        ref={svgRef}
        className="canvas-object-overlay"
        viewBox={`0 0 ${width} ${height}`}
        aria-label="canvas objects"
      >
        {layers.map((layer) => {
          const selected = layer.id === selectedLayerId;
          const rotateHandleY = Math.max(
            handleSize,
            layer.y - handleSize * 2.2,
          );
          return (
            <g key={layer.id} transform={layerTransform(layer)}>
              <rect
                className="canvas-object-hitbox"
                x={layer.x}
                y={layer.y}
                width={layer.width}
                height={layer.height}
                aria-label={layer.type}
                onPointerDown={(event) => begin(event, layer, "move")}
              />
              {selected ? (
                <>
                  <rect
                    className={
                      layer.locked
                        ? "canvas-object-selection canvas-object-selection--locked"
                        : "canvas-object-selection"
                    }
                    x={layer.x}
                    y={layer.y}
                    width={layer.width}
                    height={layer.height}
                  />
                  {layer.locked ? (
                    <g aria-label={lockedLabel}>
                      <LockGlyph
                        x={layer.x + layer.width - lockSize - 8}
                        y={layer.y + 8}
                        size={lockSize}
                      />
                    </g>
                  ) : (
                    <>
                      <line
                        className="canvas-object-rotate-line"
                        x1={layer.x + layer.width / 2}
                        y1={layer.y}
                        x2={layer.x + layer.width / 2}
                        y2={rotateHandleY}
                      />
                      <circle
                        className="canvas-object-handle canvas-object-rotate-handle"
                        cx={layer.x + layer.width / 2}
                        cy={rotateHandleY}
                        r={handleSize * 0.7}
                        onPointerDown={(event) => begin(event, layer, "rotate")}
                      />
                      <rect
                        className="canvas-object-handle canvas-object-resize-handle"
                        x={layer.x + layer.width - handleSize / 2}
                        y={layer.y + layer.height - handleSize / 2}
                        width={handleSize}
                        height={handleSize}
                        rx={handleSize * 0.18}
                        onPointerDown={(event) => begin(event, layer, "resize")}
                      />
                    </>
                  )}
                </>
              ) : null}
            </g>
          );
        })}
      </svg>
    </>
  );
}
