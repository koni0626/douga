import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ProjectDocument } from "@douga/project-schema";

import { FONT_CATEGORIES, FONT_OPTIONS } from "../lib/fontCatalog";

type Layer = ProjectDocument["scenes"][number]["layers"][number];
type TextLayer = Extract<Layer, { type: "text" }>;

interface TextStyleMenuProps {
  layer: TextLayer;
  onBack: () => void;
  onPatch: (patch: Partial<TextLayer>) => void;
}

function colorValue(value: string | undefined, fallback: string): string {
  return /^#[\da-f]{6}$/iu.test(value ?? "") ? (value ?? fallback) : fallback;
}

export function TextStyleMenu({ layer, onBack, onPatch }: TextStyleMenuProps) {
  const { t } = useTranslation();
  const [fontSizeDraft, setFontSizeDraft] = useState(String(layer.font_size));
  const selectedFont = layer.font_family ?? "sans-serif";
  const selectedFontIsKnown = FONT_OPTIONS.some(
    (option) => option.family === selectedFont,
  );
  const typewriter = layer.display_effect === "typewriter";
  const neon = layer.text_style === "neon";

  useEffect(() => {
    setFontSizeDraft(String(layer.font_size));
  }, [layer.font_size]);

  function updateFontSize(value: string) {
    setFontSizeDraft(value);
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 8 && parsed <= 500)
      onPatch({ font_size: parsed });
  }

  function finishFontSizeInput() {
    const parsed = Number(fontSizeDraft);
    if (Number.isFinite(parsed) && parsed >= 8 && parsed <= 500) {
      setFontSizeDraft(String(parsed));
      if (parsed !== layer.font_size) onPatch({ font_size: parsed });
      return;
    }
    setFontSizeDraft(String(layer.font_size));
  }

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
          value={selectedFont}
          style={{ fontFamily: selectedFont }}
          onChange={(event) => onPatch({ font_family: event.target.value })}
        >
          {!selectedFontIsKnown ? (
            <option value={selectedFont}>{selectedFont}</option>
          ) : null}
          {FONT_CATEGORIES.map((category) => (
            <optgroup
              key={category}
              label={t(`editor.textStyle.fontCategory.${category}`)}
            >
              {FONT_OPTIONS.filter(
                (option) => option.category === category,
              ).map((option) => (
                <option
                  key={option.family}
                  style={{ fontFamily: option.family }}
                  value={option.family}
                >
                  {option.label}
                </option>
              ))}
            </optgroup>
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
          value={fontSizeDraft}
          onBlur={finishFontSizeInput}
          onChange={(event) => updateFontSize(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
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
