import type { ProjectDocument } from "@douga/project-schema";

import type { Layer } from "./editorTypes";

export type TextLayer = Extract<Layer, { type: "text" }>;
export type TextWritingMode = NonNullable<TextLayer["writing_mode"]>;

export interface CreateTextLayerOptions {
  durationMs: number;
  id: string;
  startMs: number;
  text: string;
  video?: ProjectDocument["video"];
  writingMode: TextWritingMode;
}

export type TextLayerContentPatch = Pick<TextLayer, "text"> &
  Partial<Pick<TextLayer, "width" | "x">>;

export function fitTextLayerToContent(
  layer: TextLayer,
  text: string,
): TextLayerContentPatch {
  if (layer.writing_mode !== "vertical") return { text };
  const columns = Math.max(1, text.split(/\r\n?|\n/u).length);
  const requiredWidth = Math.ceil((columns + 0.5) * layer.font_size);
  if (requiredWidth <= layer.width) return { text };
  return {
    text,
    width: requiredWidth,
    x: layer.x - (requiredWidth - layer.width),
  };
}

export function createTextLayer({
  durationMs,
  id,
  startMs,
  text,
  video,
  writingMode,
}: CreateTextLayerOptions): TextLayer {
  const vertical = writingMode === "vertical";
  const canvasWidth = video?.width ?? 1920;
  const canvasHeight = video?.height ?? 1080;
  const width = Math.round(
    vertical
      ? Math.min(200, canvasWidth * 0.22)
      : Math.min(900, canvasWidth * 0.72),
  );
  const height = Math.round(
    vertical
      ? Math.min(900, canvasHeight * 0.72)
      : Math.min(180, canvasHeight * 0.22),
  );
  return {
    id,
    type: "text",
    text,
    writing_mode: writingMode,
    font_family: "sans-serif",
    font_size: 64,
    color: "#ffffff",
    text_style: "solid",
    neon_color: "#9bdcff",
    display_effect: "instant",
    characters_per_second: 16,
    x: Math.round((canvasWidth - width) / 2),
    y: Math.round((canvasHeight - height) / 2),
    width,
    height,
    rotation: 0,
    opacity: 1,
    start_ms: startMs,
    end_ms: durationMs,
  };
}

export function duplicateTextLayer(
  source: TextLayer,
  id: string,
  createKeyframeId: () => string,
): TextLayer {
  return {
    ...structuredClone(source),
    id,
    track_id: undefined,
    keyframes: source.keyframes?.map((keyframe) => ({
      ...structuredClone(keyframe),
      id: createKeyframeId(),
    })),
  };
}
