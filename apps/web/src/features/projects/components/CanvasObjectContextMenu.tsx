import { useState } from "react";

import type { ProjectDocument } from "@douga/project-schema";

import type { LayerAnimationPreset } from "../lib/layerKeyframes";
import {
  AnimationPresetMenu,
  type AnimationPresetLabels,
} from "./AnimationPresetMenu";
import { TextStyleMenu } from "./TextStyleMenu";

type Layer = ProjectDocument["scenes"][number]["layers"][number];
type TextLayer = Extract<Layer, { type: "text" }>;
type MenuPatch = Partial<Pick<Layer, "flip_x" | "flip_y" | "locked">>;

interface CanvasObjectContextMenuProps {
  animationLabels: AnimationPresetLabels;
  fillCanvasLabel: string;
  flipHorizontalLabel: string;
  flipVerticalLabel: string;
  layer: Layer;
  lockLabel: string;
  onApplyAnimation: (preset: LayerAnimationPreset, durationMs: number) => void;
  onClearAnimation: () => void;
  onClose: () => void;
  onFillCanvas: () => void;
  onPatch: (patch: MenuPatch) => void;
  onTextPatch: (patch: Partial<TextLayer>) => void;
  textSettingsLabel: string;
  unlockLabel: string;
  x: number;
  y: number;
}

export function CanvasObjectContextMenu({
  animationLabels,
  fillCanvasLabel,
  flipHorizontalLabel,
  flipVerticalLabel,
  layer,
  lockLabel,
  onApplyAnimation,
  onClearAnimation,
  onClose,
  onFillCanvas,
  onPatch,
  onTextPatch,
  textSettingsLabel,
  unlockLabel,
  x,
  y,
}: CanvasObjectContextMenuProps) {
  const [panel, setPanel] = useState<"animation" | "effect" | "text">();

  return (
    <div
      className={
        panel
          ? "canvas-object-context-menu canvas-object-context-menu--presets"
          : "canvas-object-context-menu"
      }
      role="menu"
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {panel === "text" && layer.type === "text" ? (
        <TextStyleMenu
          layer={layer}
          onBack={() => setPanel(undefined)}
          onPatch={onTextPatch}
        />
      ) : panel ? (
        <AnimationPresetMenu
          kind={panel as "animation" | "effect"}
          labels={animationLabels}
          onApply={(preset, durationMs) => {
            onApplyAnimation(preset, durationMs);
            onClose();
          }}
          onBack={() => setPanel(undefined)}
          onClear={() => {
            onClearAnimation();
            onClose();
          }}
        />
      ) : (
        <>
          <button
            type="button"
            role="menuitem"
            disabled={layer.locked}
            onClick={() => onPatch({ flip_x: !layer.flip_x })}
          >
            {flipHorizontalLabel}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={layer.locked}
            onClick={() => onPatch({ flip_y: !layer.flip_y })}
          >
            {flipVerticalLabel}
          </button>
          {layer.type === "image" ? (
            <button
              type="button"
              role="menuitem"
              disabled={layer.locked}
              onClick={onFillCanvas}
            >
              {fillCanvasLabel}
            </button>
          ) : null}
          {layer.type === "text" ? (
            <button
              type="button"
              role="menuitem"
              disabled={layer.locked}
              onClick={() => setPanel("text")}
            >
              {textSettingsLabel} ›
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            disabled={layer.locked}
            onClick={() => setPanel("animation")}
          >
            {animationLabels.animation} ›
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={layer.locked}
            onClick={() => setPanel("effect")}
          >
            {animationLabels.effect} ›
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => onPatch({ locked: !layer.locked })}
          >
            {layer.locked ? unlockLabel : lockLabel}
          </button>
        </>
      )}
    </div>
  );
}
