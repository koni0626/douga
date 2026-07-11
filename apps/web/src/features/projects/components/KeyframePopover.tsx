import { useEffect, useRef } from "react";

import type { LayerEasing, LayerKeyframe } from "@douga/scene-renderer";

export interface KeyframeLabels {
  delete: string;
  duplicate: string;
  easing: string;
  easingOptions: Record<LayerEasing, string>;
  keyframe: string;
}

interface KeyframePopoverProps {
  keyframe: LayerKeyframe;
  labels: KeyframeLabels;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onEasingChange: (easing: LayerEasing) => void;
  x: number;
  y: number;
}

const EASINGS: LayerEasing[] = [
  "linear",
  "ease_in_out",
  "ease_in",
  "ease_out",
  "bounce",
  "step",
];

export function KeyframePopover({
  keyframe,
  labels,
  onClose,
  onDelete,
  onDuplicate,
  onEasingChange,
  x,
  y,
}: KeyframePopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: globalThis.PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="keyframe-popover"
      role="dialog"
      aria-label={labels.keyframe}
      style={{
        left: Math.min(x, window.innerWidth - 250),
        top: Math.min(y, window.innerHeight - 190),
      }}
    >
      <strong>
        {labels.keyframe} {(keyframe.time_ms / 1000).toFixed(1)}s
      </strong>
      <label>
        <span>{labels.easing}</span>
        <select
          value={keyframe.easing}
          onChange={(event) =>
            onEasingChange(event.target.value as LayerEasing)
          }
        >
          {EASINGS.map((easing) => (
            <option value={easing} key={easing}>
              {labels.easingOptions[easing]}
            </option>
          ))}
        </select>
      </label>
      <div className="keyframe-popover-actions">
        <button type="button" onClick={onDuplicate}>
          {labels.duplicate}
        </button>
        <button type="button" className="danger" onClick={onDelete}>
          {labels.delete}
        </button>
      </div>
    </div>
  );
}
