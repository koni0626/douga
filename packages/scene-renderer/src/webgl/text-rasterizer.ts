import type { ProjectDocument } from "@douga/project-schema";

import type { ResolvedCaption } from "../layout";
import type { TextLayer } from "../text";

export interface RasterizedText {
  canvas: HTMLCanvasElement;
  cacheKey: string;
}

export function textLayerRasterKey(
  layer: TextLayer,
  text: string,
  pixelScale: number,
) {
  return JSON.stringify([
    "layer",
    text,
    layer.width,
    layer.height,
    layer.font_size,
    layer.font_family,
    layer.color,
    layer.writing_mode,
    layer.text_style,
    layer.neon_color,
    pixelScale,
  ]);
}

export function captionRasterKey(
  style: ProjectDocument["caption_style"],
  resolved: ResolvedCaption,
  pixelScale: number,
) {
  return JSON.stringify(["caption", resolved.lines, style, pixelScale]);
}

function graphemes(value: string): string[] {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value),
      (part) => part.segment,
    );
  }
  return Array.from(value);
}

function createCanvas(width: number, height: number, pixelScale: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * pixelScale));
  canvas.height = Math.max(1, Math.ceil(height * pixelScale));
  return canvas;
}

function roundedRectangle(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.roundRect(0, 0, width, height, safeRadius);
  context.closePath();
}

function drawLayerText(
  context: CanvasRenderingContext2D,
  layer: TextLayer,
  text: string,
  pixelScale: number,
) {
  const fontSize = layer.font_size * pixelScale;
  const fontFamily = layer.font_family ?? "sans-serif";
  const neon = layer.text_style === "neon";
  context.font = `${fontSize}px ${fontFamily}`;
  context.textBaseline = "top";
  if (neon) {
    context.shadowBlur = Math.max(3, fontSize * 0.12);
    context.shadowColor = layer.neon_color ?? "#9bdcff";
    const gradient = context.createLinearGradient(
      0,
      0,
      context.canvas.width,
      context.canvas.height,
    );
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.45, layer.neon_color ?? "#9bdcff");
    gradient.addColorStop(1, layer.color);
    context.fillStyle = gradient;
  } else {
    context.fillStyle = layer.color;
  }

  const lines = text.split("\n");
  if (layer.writing_mode === "vertical") {
    lines.forEach((line, columnIndex) => {
      const x = context.canvas.width - fontSize * (columnIndex + 1);
      graphemes(line).forEach((character, characterIndex) => {
        context.fillText(character, x, characterIndex * fontSize);
      });
    });
    return;
  }
  lines.forEach((line, index) => {
    context.fillText(line, 0, index * fontSize * 1.2);
  });
}

export function rasterizeTextLayer(
  layer: TextLayer,
  text: string,
  pixelScale: number,
): RasterizedText {
  const cacheKey = textLayerRasterKey(layer, text, pixelScale);
  const canvas = createCanvas(layer.width, layer.height, pixelScale);
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("Canvas 2D is unavailable for text rasterization");
  drawLayerText(context, layer, text, pixelScale);
  return { canvas, cacheKey };
}

export function rasterizeCaption(
  style: ProjectDocument["caption_style"],
  resolved: ResolvedCaption,
  pixelScale: number,
): RasterizedText | undefined {
  if (!resolved.page) return undefined;
  const cacheKey = captionRasterKey(style, resolved, pixelScale);
  const canvas = createCanvas(style.width, style.height, pixelScale);
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("Canvas 2D is unavailable for caption rasterization");
  const scaledWidth = style.width * pixelScale;
  const scaledHeight = style.height * pixelScale;
  roundedRectangle(
    context,
    scaledWidth,
    scaledHeight,
    style.border_radius * pixelScale,
  );
  context.globalAlpha = style.background_opacity;
  context.fillStyle = style.background_color;
  context.fill();
  context.globalAlpha = 1;
  context.fillStyle = style.text_color;
  context.font = `${style.font_weight ?? 600} ${style.font_size * pixelScale}px ${style.font_family}`;
  context.textBaseline = "alphabetic";
  context.textAlign = style.text_align;
  const x =
    style.text_align === "center"
      ? scaledWidth / 2
      : style.text_align === "right"
        ? scaledWidth - style.padding * pixelScale
        : style.padding * pixelScale;
  resolved.lines.forEach((line, index) => {
    const y =
      (style.padding + style.font_size) * pixelScale +
      index * style.font_size * style.line_height * pixelScale;
    context.fillText(line, x, y);
  });
  return { canvas, cacheKey };
}
