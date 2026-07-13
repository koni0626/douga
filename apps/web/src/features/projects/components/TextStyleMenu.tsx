import { useTranslation } from "react-i18next";

import type { ProjectDocument } from "@douga/project-schema";

type Layer = ProjectDocument["scenes"][number]["layers"][number];
type TextLayer = Extract<Layer, { type: "text" }>;

interface TextStyleMenuProps {
  layer: TextLayer;
  onBack: () => void;
  onPatch: (patch: Partial<TextLayer>) => void;
}

const FONT_OPTIONS = [
  { value: "sans-serif", labelKey: "editor.textStyle.fontSans" },
  { value: "serif", labelKey: "editor.textStyle.fontSerif" },
  { value: "monospace", labelKey: "editor.textStyle.fontMonospace" },
  {
    value: '"Noto Sans JP", "Yu Gothic", sans-serif',
    labelKey: "editor.textStyle.fontJapaneseGothic",
  },
  {
    value: '"Noto Serif JP", "Yu Mincho", serif',
    labelKey: "editor.textStyle.fontJapaneseMincho",
  },
] as const;

function colorValue(value: string | undefined, fallback: string): string {
  return /^#[\da-f]{6}$/iu.test(value ?? "") ? (value ?? fallback) : fallback;
}

export function TextStyleMenu({ layer, onBack, onPatch }: TextStyleMenuProps) {
  const { t } = useTranslation();
  const typewriter = layer.display_effect === "typewriter";
  const neon = layer.text_style === "neon";
  return (
    <div className="text-style-menu">
      <div className="animation-preset-header">
        <button
          type="button"
          aria-label={t("editor.animation.back")}
          onClick={onBack}
        >
          ←
        </button>
        <strong>{t("editor.textStyle.title")}</strong>
      </div>
      <label>
        <span>{t("editor.textStyle.direction")}</span>
        <select
          value={layer.writing_mode ?? "horizontal"}
          onChange={(event) =>
            onPatch({
              writing_mode: event.target.value as TextLayer["writing_mode"],
            })
          }
        >
          <option value="horizontal">{t("editor.textStyle.horizontal")}</option>
          <option value="vertical">{t("editor.textStyle.vertical")}</option>
        </select>
      </label>
      <label>
        <span>{t("editor.textStyle.font")}</span>
        <select
          value={layer.font_family ?? "sans-serif"}
          onChange={(event) => onPatch({ font_family: event.target.value })}
        >
          {FONT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{t("editor.fontSize")}</span>
        <input
          type="number"
          min={8}
          max={500}
          step={1}
          value={layer.font_size}
          onChange={(event) => {
            const value = event.target.valueAsNumber;
            if (Number.isFinite(value) && value >= 8 && value <= 500)
              onPatch({ font_size: value });
          }}
        />
      </label>
      <label>
        <span>{t("editor.textColor")}</span>
        <input
          type="color"
          value={colorValue(layer.color, "#ffffff")}
          onChange={(event) => onPatch({ color: event.target.value })}
        />
      </label>
      <label className="text-style-toggle">
        <input
          type="checkbox"
          checked={neon}
          onChange={(event) =>
            onPatch({ text_style: event.target.checked ? "neon" : "solid" })
          }
        />
        <span>{t("editor.textStyle.neon")}</span>
      </label>
      {neon ? (
        <label>
          <span>{t("editor.textStyle.neonColor")}</span>
          <input
            type="color"
            value={colorValue(layer.neon_color, "#9bdcff")}
            onChange={(event) => onPatch({ neon_color: event.target.value })}
          />
        </label>
      ) : null}
      <label>
        <span>{t("editor.textStyle.displayEffect")}</span>
        <select
          value={layer.display_effect ?? "instant"}
          onChange={(event) =>
            onPatch({
              display_effect: event.target.value as TextLayer["display_effect"],
            })
          }
        >
          <option value="instant">{t("editor.textStyle.effectInstant")}</option>
          <option value="typewriter">
            {t("editor.textStyle.effectTypewriter")}
          </option>
        </select>
      </label>
      {typewriter ? (
        <label>
          <span>{t("editor.textStyle.charactersPerSecond")}</span>
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            value={layer.characters_per_second ?? 16}
            onChange={(event) => {
              const value = event.target.valueAsNumber;
              if (Number.isFinite(value) && value >= 1 && value <= 100)
                onPatch({ characters_per_second: value });
            }}
          />
        </label>
      ) : null}
    </div>
  );
}
