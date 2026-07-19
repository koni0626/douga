import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";

import type { ProjectDocument } from "@douga/project-schema";

import { NumberField } from "./EditorFields";

type CaptionStyle = ProjectDocument["caption_style"];

interface CaptionStyleSettingsProps {
  captionStyle: CaptionStyle;
  onUpdate: (patch: Partial<CaptionStyle>) => void;
}

const DEFAULT_BACKGROUND_OPACITY = 0.75;

function toTransparency(opacity: number): number {
  return Math.round((1 - Math.max(0, Math.min(1, opacity))) * 100);
}

export function CaptionStyleSettings({
  captionStyle,
  onUpdate,
}: CaptionStyleSettingsProps) {
  const { t } = useTranslation();
  const transparencyInputId = useId();
  const backgroundVisible = captionStyle.background_opacity > 0;
  const lastVisibleOpacity = useRef(
    backgroundVisible
      ? captionStyle.background_opacity
      : DEFAULT_BACKGROUND_OPACITY,
  );

  useEffect(() => {
    if (captionStyle.background_opacity > 0) {
      lastVisibleOpacity.current = captionStyle.background_opacity;
    }
  }, [captionStyle.background_opacity]);

  return (
    <div className="property-grid">
      {(["x", "y", "width", "height"] as const).map((key) => (
        <NumberField
          key={key}
          label={key}
          value={captionStyle[key]}
          min={key === "width" || key === "height" ? 1 : undefined}
          onChange={(value) => onUpdate({ [key]: value })}
        />
      ))}
      <NumberField
        label={t("editor.fontSize")}
        value={captionStyle.font_size}
        min={8}
        onChange={(value) => onUpdate({ font_size: value })}
      />
      <NumberField
        label={t("editor.maxLines")}
        value={captionStyle.max_lines}
        min={1}
        max={20}
        onChange={(value) => onUpdate({ max_lines: value })}
      />
      <label>
        <span>{t("editor.textColor")}</span>
        <input
          type="color"
          value={captionStyle.text_color}
          onChange={(event) => onUpdate({ text_color: event.target.value })}
        />
      </label>
      <label className="caption-background-toggle">
        <input
          type="checkbox"
          checked={backgroundVisible}
          onChange={(event) =>
            onUpdate({
              background_opacity: event.target.checked
                ? lastVisibleOpacity.current
                : 0,
            })
          }
        />
        <span>{t("editor.captionBackgroundVisible")}</span>
      </label>
      <label>
        <span>{t("editor.backgroundColor")}</span>
        <input
          type="color"
          value={captionStyle.background_color}
          disabled={!backgroundVisible}
          onChange={(event) =>
            onUpdate({ background_color: event.target.value })
          }
        />
      </label>
      <NumberField
        label={t("editor.borderRadius")}
        value={captionStyle.border_radius}
        min={0}
        onChange={(value) => onUpdate({ border_radius: value })}
      />
      <div className="caption-background-transparency">
        <div className="shape-style-slider-label">
          <label htmlFor={transparencyInputId}>
            {t("editor.shapeStyle.transparency")}
          </label>
          <output>{toTransparency(captionStyle.background_opacity)}%</output>
        </div>
        <input
          id={transparencyInputId}
          type="range"
          min={0}
          max={100}
          step={1}
          value={toTransparency(captionStyle.background_opacity)}
          disabled={!backgroundVisible}
          onChange={(event) =>
            onUpdate({
              background_opacity: 1 - Number(event.target.value) / 100,
            })
          }
        />
      </div>
    </div>
  );
}
