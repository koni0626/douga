import { useTranslation } from "react-i18next";

import type { ProjectDocument } from "@douga/project-schema";

type Layer = ProjectDocument["scenes"][number]["layers"][number];
type ShapeLayer = Extract<Layer, { type: "shape" }>;

interface ShapeStyleMenuProps {
  layer: ShapeLayer;
  onBack: () => void;
  onPatch: (patch: Partial<ShapeLayer>) => void;
}

function toTransparency(opacity: number): number {
  return Math.round((1 - Math.max(0, Math.min(1, opacity))) * 100);
}

export function ShapeStyleMenu({
  layer,
  onBack,
  onPatch,
}: ShapeStyleMenuProps) {
  const { t } = useTranslation();
  const transparency = toTransparency(layer.opacity);

  return (
    <div className="text-style-menu shape-style-menu">
      <div className="animation-preset-header">
        <button
          type="button"
          aria-label={t("editor.animation.back")}
          onClick={onBack}
        >
          ←
        </button>
        <strong>{t("editor.shapeStyle.title")}</strong>
      </div>
      <label>
        <span>{t("editor.color")}</span>
        <input
          type="color"
          value={layer.fill}
          onChange={(event) => onPatch({ fill: event.target.value })}
        />
      </label>
      <label>
        <span className="shape-style-slider-label">
          <span>{t("editor.shapeStyle.transparency")}</span>
          <output>{transparency}%</output>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={transparency}
          onChange={(event) =>
            onPatch({ opacity: 1 - Number(event.target.value) / 100 })
          }
        />
      </label>
    </div>
  );
}
