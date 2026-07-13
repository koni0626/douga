import { useTranslation } from "react-i18next";

import type { ProjectDocument } from "@douga/project-schema";

import { assetContentUrl, type AssetDto } from "../../../shared/lib/api";
import type { Dialogue, EditorTool, Layer, Scene } from "../lib/editorTypes";
import { createTextLayer } from "../lib/textLayers";
import { NumberField } from "./EditorFields";

export interface DialogueLayerSettingsProps {
  activeTool: EditorTool;
  durationMs: number;
  imageAssets: AssetDto[];
  onAddDialogue: () => void;
  onAddImage: (asset: AssetDto) => void;
  onAddLayer: (layer: Layer) => void;
  onDeleteDialogue: (dialogueId: string) => void;
  onDeleteLayer: (layerId: string) => void;
  onSelectLayer: (layerId: string) => void;
  onUpdateDialogue: (dialogueId: string, patch: Partial<Dialogue>) => void;
  onUpdateLayer: (layerId: string, patch: Partial<Layer>) => void;
  scene: Scene;
  selectedLayer?: Layer;
  selectedLayerId?: string;
  video: ProjectDocument["video"];
}

export function DialogueLayerSettings({
  activeTool,
  durationMs,
  imageAssets,
  onAddDialogue,
  onAddImage,
  onAddLayer,
  onDeleteDialogue,
  onDeleteLayer,
  onSelectLayer,
  onUpdateDialogue,
  onUpdateLayer,
  scene,
  selectedLayer,
  selectedLayerId,
  video,
}: DialogueLayerSettingsProps) {
  const { t } = useTranslation();
  return (
    <>
      <details open hidden={activeTool !== "dialogues"}>
        <summary>{t("editor.dialogues")}</summary>
        <button type="button" onClick={onAddDialogue}>
          {t("editor.addDialogue")}
        </button>
        {scene.dialogues.map((dialogue) => (
          <div className="dialogue-editor" key={dialogue.id}>
            <textarea
              aria-label={t("editor.dialogueText")}
              value={dialogue.text}
              onChange={(event) =>
                onUpdateDialogue(dialogue.id, { text: event.target.value })
              }
            />
            <div className="field-row">
              <label>
                <span>{t("editor.effect")}</span>
                <select
                  value={dialogue.display_effect}
                  onChange={(event) =>
                    onUpdateDialogue(dialogue.id, {
                      display_effect: event.target
                        .value as Dialogue["display_effect"],
                    })
                  }
                >
                  <option value="typewriter">Typewriter</option>
                  <option value="fade">Fade</option>
                  <option value="instant">Instant</option>
                </select>
              </label>
              <label>
                <span>{t("editor.duration")}</span>
                <select
                  value={dialogue.duration_mode}
                  onChange={(event) =>
                    onUpdateDialogue(dialogue.id, {
                      duration_mode: event.target
                        .value as Dialogue["duration_mode"],
                    })
                  }
                >
                  <option value="auto">Auto</option>
                  <option value="manual">Manual</option>
                  <option value="narration">Narration</option>
                </select>
              </label>
            </div>
            {dialogue.duration_mode === "manual" ? (
              <NumberField
                label={t("editor.durationMs")}
                value={dialogue.duration_ms ?? 3000}
                min={1}
                onChange={(value) =>
                  onUpdateDialogue(dialogue.id, {
                    duration_ms: Math.round(value),
                  })
                }
              />
            ) : null}
            <button
              type="button"
              className="danger"
              onClick={() => onDeleteDialogue(dialogue.id)}
            >
              {t("editor.delete")}
            </button>
          </div>
        ))}
      </details>

      <details open hidden={activeTool !== "layers"}>
        <summary>{t("editor.layers")}</summary>
        <div className="panel-actions">
          {(["horizontal", "vertical"] as const).map((writingMode) => (
            <button
              type="button"
              key={writingMode}
              onClick={() =>
                onAddLayer(
                  createTextLayer({
                    durationMs,
                    id: crypto.randomUUID(),
                    startMs: 0,
                    text: t("editor.newText"),
                    video,
                    writingMode,
                  }),
                )
              }
            >
              {t(
                writingMode === "horizontal"
                  ? "editor.addTextHorizontal"
                  : "editor.addTextVertical",
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              onAddLayer({
                id: crypto.randomUUID(),
                type: "shape",
                shape: "rectangle",
                fill: "#3ea6ff",
                x: 160,
                y: 140,
                width: 400,
                height: 240,
                rotation: 0,
                opacity: 1,
                start_ms: 0,
                end_ms: durationMs,
              })
            }
          >
            {t("editor.addShape")}
          </button>
        </div>
        <div className="asset-picker">
          {imageAssets.map((asset) => (
            <button
              type="button"
              key={asset.id}
              onClick={() => onAddImage(asset)}
            >
              <img src={assetContentUrl(asset.id)} alt="" />
              <span>{asset.name}</span>
            </button>
          ))}
        </div>
        {scene.layers.map((layer) => (
          <button
            type="button"
            className={
              selectedLayerId === layer.id
                ? "layer-row layer-row--active"
                : "layer-row"
            }
            key={layer.id}
            onClick={() => onSelectLayer(layer.id)}
          >
            {t(`editor.layerType.${layer.type}`)}
          </button>
        ))}
      </details>

      {selectedLayer ? (
        <details open hidden={activeTool !== "layers"}>
          <summary>{t("editor.layerSettings")}</summary>
          {selectedLayer.type === "text" ? (
            <label>
              <span>{t("editor.text")}</span>
              <input
                value={selectedLayer.text}
                onChange={(event) =>
                  onUpdateLayer(selectedLayer.id, { text: event.target.value })
                }
              />
            </label>
          ) : null}
          {selectedLayer.type === "shape" ? (
            <label>
              <span>{t("editor.color")}</span>
              <input
                type="color"
                value={selectedLayer.fill}
                onChange={(event) =>
                  onUpdateLayer(selectedLayer.id, { fill: event.target.value })
                }
              />
            </label>
          ) : null}
          <div className="property-grid">
            {(
              ["x", "y", "width", "height", "rotation", "opacity"] as const
            ).map((key) => (
              <NumberField
                key={key}
                label={key}
                value={selectedLayer[key]}
                min={key === "opacity" ? 0 : undefined}
                max={key === "opacity" ? 1 : undefined}
                step={key === "opacity" ? 0.05 : 1}
                onChange={(value) =>
                  onUpdateLayer(selectedLayer.id, { [key]: value })
                }
              />
            ))}
          </div>
          <button
            type="button"
            className="danger"
            onClick={() => onDeleteLayer(selectedLayer.id)}
          >
            {t("editor.delete")}
          </button>
        </details>
      ) : null}
    </>
  );
}
