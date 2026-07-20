import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import type { ProjectDocument } from "@douga/project-schema";
import {
  cameraTransformValue,
  type CameraTransform,
} from "@douga/scene-renderer";

import type { LayerAnimationPreset } from "../lib/layerKeyframes";
import {
  resizeRectangleFromAnchor,
  type ResizeAnchor,
} from "../lib/canvasResize";
import { fitTextLayerToContent } from "../lib/textLayers";
import type { AnimationPresetLabels } from "./AnimationPresetMenu";
import { CanvasObjectContextMenu } from "./CanvasObjectContextMenu";
import { CanvasInlineTextEditor } from "./CanvasInlineTextEditor";

type Layer = ProjectDocument["scenes"][number]["layers"][number];
type TextLayer = Extract<Layer, { type: "text" }>;
type ShapeLayer = Extract<Layer, { type: "shape" }>;
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
  resizeAnchor?: ResizeAnchor;
};

export interface CanvasObjectEditorProps {
  animationLabels: AnimationPresetLabels;
  cameraTransform: CameraTransform;
  downloadImageLabel: string;
  flipHorizontalLabel: string;
  flipVerticalLabel: string;
  fillCanvasLabel: string;
  height: number;
  inlineTextLabel: string;
  layers: Layer[];
  lockLabel: string;
  lockedLabel: string;
  onCommit: (layerId: string, patch: Partial<Layer>) => void;
  onApplyAnimation: (
    layerId: string,
    preset: LayerAnimationPreset,
    durationMs: number,
  ) => void;
  onClearAnimation: (layerId: string) => void;
  onDownloadImage: (assetId: string, layerName?: string) => void;
  onPreview: (layerId: string, patch?: LayerTransformPatch) => void;
  onSelect: (layerId: string) => void;
  selectedLayerId?: string;
  textSettingsLabel: string;
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
  animationLabels,
  cameraTransform,
  downloadImageLabel,
  flipHorizontalLabel,
  flipVerticalLabel,
  fillCanvasLabel,
  height,
  inlineTextLabel,
  layers,
  lockLabel,
  lockedLabel,
  onCommit,
  onApplyAnimation,
  onClearAnimation,
  onDownloadImage,
  onPreview,
  onSelect,
  selectedLayerId,
  textSettingsLabel,
  unlockLabel,
  width,
}: CanvasObjectEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const interactionRef = useRef<Interaction | undefined>(undefined);
  const patchRef = useRef<LayerTransformPatch | undefined>(undefined);
  const [editingTextLayerId, setEditingTextLayerId] = useState<string>();
  const [contextMenu, setContextMenu] = useState<{
    layerId: string;
    x: number;
    y: number;
  }>();
  const menuLayer = layers.find((layer) => layer.id === contextMenu?.layerId);

  function clientPoint(clientX: number, clientY: number): Point {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    const raw = {
      x: ((clientX - bounds.left) / bounds.width) * width,
      y: ((clientY - bounds.top) / bounds.height) * height,
    };
    const centerX = width / 2;
    const centerY = height / 2;
    const translatedX =
      (raw.x - centerX - cameraTransform.x) / cameraTransform.scale;
    const translatedY =
      (raw.y - centerY - cameraTransform.y) / cameraTransform.scale;
    const radians = (-cameraTransform.rotation * Math.PI) / 180;
    return {
      x:
        centerX +
        translatedX * Math.cos(radians) -
        translatedY * Math.sin(radians),
      y:
        centerY +
        translatedX * Math.sin(radians) +
        translatedY * Math.cos(radians),
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
        const anchor = interaction.resizeAnchor ?? "se";
        patch = resizeRectangleFromAnchor(layer, anchor, deltaX, deltaY);
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
  }, [
    cameraTransform.rotation,
    cameraTransform.scale,
    cameraTransform.x,
    cameraTransform.y,
    height,
    onCommit,
    onPreview,
    width,
  ]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = (event: globalThis.PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(".canvas-object-context-menu")
      )
        return;
      setContextMenu(undefined);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setContextMenu(undefined);
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  function begin(
    event: PointerEvent<SVGElement>,
    layer: Layer,
    operation: Operation,
    resizeAnchor?: ResizeAnchor,
  ) {
    event.preventDefault();
    event.stopPropagation();
    setEditingTextLayerId(undefined);
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
      resizeAnchor,
    };
    patchRef.current = undefined;
  }

  function openContextMenu(
    event: ReactMouseEvent<SVGRectElement>,
    layer: Layer,
  ) {
    event.preventDefault();
    event.stopPropagation();
    onSelect(layer.id);
    setContextMenu({
      layerId: layer.id,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 370)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 560)),
    });
  }

  function commitFromMenu(patch: Partial<Layer>) {
    if (!menuLayer) return;
    onCommit(menuLayer.id, patch);
    setContextMenu(undefined);
  }

  function commitTextStyle(patch: Partial<TextLayer>) {
    if (!menuLayer || menuLayer.type !== "text") return;
    onCommit(menuLayer.id, patch);
  }

  function commitShapeStyle(patch: Partial<ShapeLayer>) {
    if (!menuLayer || menuLayer.type !== "shape") return;
    onCommit(menuLayer.id, patch);
  }

  function fillCanvas() {
    if (!menuLayer || menuLayer.type !== "image") return;
    const scale = Math.max(width / menuLayer.width, height / menuLayer.height);
    const nextWidth = Math.round(menuLayer.width * scale);
    const nextHeight = Math.round(menuLayer.height * scale);
    commitFromMenu({
      x: Math.round((width - nextWidth) / 2),
      y: Math.round((height - nextHeight) / 2),
      width: nextWidth,
      height: nextHeight,
      rotation: 0,
    });
  }

  const handleSize = Math.max(14, Math.min(width, height) * 0.018);
  const lockSize = Math.max(28, Math.min(width, height) * 0.045);

  return (
    <>
      <svg
        ref={svgRef}
        className="canvas-object-overlay"
        viewBox={`0 0 ${width} ${height}`}
        aria-label="canvas objects"
      >
        <g transform={cameraTransformValue(cameraTransform, width, height)}>
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
                  onContextMenu={(event) => openContextMenu(event, layer)}
                  onDoubleClick={(event) => {
                    if (layer.type !== "text" || layer.locked) return;
                    event.preventDefault();
                    event.stopPropagation();
                    onSelect(layer.id);
                    setEditingTextLayerId(layer.id);
                  }}
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
                          onPointerDown={(event) =>
                            begin(event, layer, "rotate")
                          }
                        />
                        {(
                          [
                            ["nw", layer.x, layer.y],
                            ["n", layer.x + layer.width / 2, layer.y],
                            ["ne", layer.x + layer.width, layer.y],
                            [
                              "e",
                              layer.x + layer.width,
                              layer.y + layer.height / 2,
                            ],
                            [
                              "se",
                              layer.x + layer.width,
                              layer.y + layer.height,
                            ],
                            [
                              "s",
                              layer.x + layer.width / 2,
                              layer.y + layer.height,
                            ],
                            ["sw", layer.x, layer.y + layer.height],
                            ["w", layer.x, layer.y + layer.height / 2],
                          ] as const
                        ).map(([anchor, x, y]) => (
                          <rect
                            key={anchor}
                            className={`canvas-object-handle canvas-object-resize-handle canvas-object-resize-handle--${anchor}`}
                            x={x - handleSize / 2}
                            y={y - handleSize / 2}
                            width={handleSize}
                            height={handleSize}
                            rx={handleSize * 0.18}
                            data-resize-anchor={anchor}
                            onPointerDown={(event) =>
                              begin(event, layer, "resize", anchor)
                            }
                          />
                        ))}
                      </>
                    )}
                  </>
                ) : null}
                {layer.type === "text" && layer.id === editingTextLayerId ? (
                  <CanvasInlineTextEditor
                    label={inlineTextLabel}
                    layer={layer}
                    onCancel={() => setEditingTextLayerId(undefined)}
                    onCommit={(text) => {
                      onCommit(layer.id, fitTextLayerToContent(layer, text));
                      setEditingTextLayerId(undefined);
                    }}
                  />
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>
      {contextMenu && menuLayer ? (
        <CanvasObjectContextMenu
          animationLabels={animationLabels}
          downloadImageLabel={downloadImageLabel}
          fillCanvasLabel={fillCanvasLabel}
          flipHorizontalLabel={flipHorizontalLabel}
          flipVerticalLabel={flipVerticalLabel}
          layer={menuLayer}
          lockLabel={lockLabel}
          onApplyAnimation={(preset, durationMs) =>
            onApplyAnimation(menuLayer.id, preset, durationMs)
          }
          onClearAnimation={() => onClearAnimation(menuLayer.id)}
          onClose={() => setContextMenu(undefined)}
          onDownloadImage={() => {
            if (menuLayer.type === "image") {
              onDownloadImage(menuLayer.asset_id, menuLayer.name);
            }
          }}
          onFillCanvas={fillCanvas}
          onPatch={commitFromMenu}
          onShapePatch={commitShapeStyle}
          onTextPatch={commitTextStyle}
          textSettingsLabel={textSettingsLabel}
          unlockLabel={unlockLabel}
          x={contextMenu.x}
          y={contextMenu.y}
        />
      ) : null}
    </>
  );
}
