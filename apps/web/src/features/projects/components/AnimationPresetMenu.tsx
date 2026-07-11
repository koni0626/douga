import { useState } from "react";

import type { LayerAnimationPreset } from "../lib/layerKeyframes";

export interface AnimationPresetLabels {
  animation: string;
  back: string;
  duration: string;
  effect: string;
  remove: string;
  presets: Record<LayerAnimationPreset, string>;
}

interface AnimationPresetMenuProps {
  kind: "animation" | "effect";
  labels: AnimationPresetLabels;
  onApply: (preset: LayerAnimationPreset, durationMs: number) => void;
  onBack: () => void;
  onClear: () => void;
}

const ANIMATIONS: LayerAnimationPreset[] = [
  "slide_left",
  "slide_right",
  "slide_up",
  "slide_down",
  "zoom_in",
  "pop",
  "bounce",
  "shake",
  "spin",
  "pulse",
  "float",
];
const EFFECTS: LayerAnimationPreset[] = [
  "fade_in",
  "fade_out",
  "blink",
  "flash",
];

export function AnimationPresetMenu({
  kind,
  labels,
  onApply,
  onBack,
  onClear,
}: AnimationPresetMenuProps) {
  const [durationMs, setDurationMs] = useState(600);
  const presets = kind === "animation" ? ANIMATIONS : EFFECTS;

  return (
    <>
      <header className="animation-preset-header">
        <button type="button" onClick={onBack} aria-label={labels.back}>
          ←
        </button>
        <strong>
          {kind === "animation" ? labels.animation : labels.effect}
        </strong>
      </header>
      <div className="animation-preset-grid">
        {presets.map((preset) => (
          <button
            type="button"
            role="menuitem"
            key={preset}
            onClick={() => onApply(preset, durationMs)}
          >
            {labels.presets[preset]}
          </button>
        ))}
      </div>
      <label className="animation-duration-field">
        <span>{labels.duration}</span>
        <select
          value={durationMs}
          onChange={(event) => setDurationMs(Number(event.target.value))}
        >
          <option value={300}>0.3s</option>
          <option value={600}>0.6s</option>
          <option value={1000}>1.0s</option>
          <option value={2000}>2.0s</option>
        </select>
      </label>
      <button
        type="button"
        role="menuitem"
        className="animation-remove-button"
        onClick={onClear}
      >
        {labels.remove}
      </button>
    </>
  );
}
