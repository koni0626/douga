import type { CSSProperties, ReactNode } from "react";

import type { ProjectDocument } from "@douga/project-schema";

import { resolveLayerAtTime } from "./animation";
import { cameraTransformValue, resolveCameraTransform } from "./camera";
import { buildSceneTimeline, resolveCaptionAtTime } from "./layout";

type Scene = ProjectDocument["scenes"][number];
type Layer = Scene["layers"][number];

export interface SceneRendererProps {
  project: ProjectDocument;
  sceneIndex?: number;
  timeMs: number;
  assetUrl?: (assetId: string) => string | undefined;
  className?: string;
  style?: CSSProperties;
  hideCaption?: boolean;
}

function layerTransform(layer: Layer): string {
  const centerX = layer.x + layer.width / 2;
  const centerY = layer.y + layer.height / 2;
  const scaleX = layer.flip_x ? -1 : 1;
  const scaleY = layer.flip_y ? -1 : 1;
  return `translate(${centerX} ${centerY}) rotate(${layer.rotation}) scale(${scaleX} ${scaleY}) translate(${-centerX} ${-centerY})`;
}

function renderLayer(
  layer: Layer,
  assetUrl?: SceneRendererProps["assetUrl"],
): ReactNode {
  if (layer.type === "image") {
    const href = assetUrl?.(layer.asset_id);
    return href ? (
      <image
        key={layer.id}
        href={href}
        x={layer.x}
        y={layer.y}
        width={layer.width}
        height={layer.height}
        opacity={layer.opacity}
        preserveAspectRatio="xMidYMid slice"
        transform={layerTransform(layer)}
      />
    ) : null;
  }

  if (layer.type === "shape") {
    const common = {
      fill: layer.fill,
      opacity: layer.opacity,
      transform: layerTransform(layer),
    };
    return layer.shape === "ellipse" ? (
      <ellipse
        key={layer.id}
        {...common}
        cx={layer.x + layer.width / 2}
        cy={layer.y + layer.height / 2}
        rx={layer.width / 2}
        ry={layer.height / 2}
      />
    ) : (
      <rect
        key={layer.id}
        {...common}
        x={layer.x}
        y={layer.y}
        width={layer.width}
        height={layer.height}
      />
    );
  }

  return (
    <text
      key={layer.id}
      x={layer.x}
      y={layer.y + layer.font_size}
      fill={layer.color}
      fontSize={layer.font_size}
      opacity={layer.opacity}
      transform={layerTransform(layer)}
    >
      {layer.text}
    </text>
  );
}

export function SceneRenderer({
  project,
  sceneIndex = 0,
  timeMs,
  assetUrl,
  className,
  style,
  hideCaption = false,
}: SceneRendererProps) {
  const scene = project.scenes[sceneIndex];
  if (!scene) {
    return null;
  }

  const { width, height } = project.video;
  const caption = project.caption_style;
  const timeline = buildSceneTimeline(scene, caption, project.content_locale);
  const resolved = resolveCaptionAtTime(timeline, timeMs);
  const backgroundHref =
    scene.background.type === "asset"
      ? assetUrl?.(scene.background.asset_id)
      : undefined;
  const backgroundColor =
    scene.background.type === "color"
      ? scene.background.color
      : (scene.background.fallback_color ?? "#111827");
  const textAnchor =
    caption.text_align === "center"
      ? "middle"
      : caption.text_align === "right"
        ? "end"
        : "start";
  const textX =
    caption.text_align === "center"
      ? caption.x + caption.width / 2
      : caption.text_align === "right"
        ? caption.x + caption.width - caption.padding
        : caption.x + caption.padding;
  const firstBaseline = caption.y + caption.padding + caption.font_size;
  const cameraTransform = cameraTransformValue(
    resolveCameraTransform(project.camera_effects ?? [], timeMs),
    width,
    height,
  );

  return (
    <svg
      className={className}
      style={style}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={project.name}
      data-render-canvas
    >
      <g transform={cameraTransform} data-camera-stage>
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill={backgroundColor}
        />
        {backgroundHref ? (
          <image
            href={backgroundHref}
            x={0}
            y={0}
            width={width}
            height={height}
            preserveAspectRatio="xMidYMid slice"
          />
        ) : null}
        {scene.layers.map((layer) =>
          timeMs >= (layer.start_ms ?? 0) &&
          timeMs < (layer.end_ms ?? Number.POSITIVE_INFINITY)
            ? renderLayer(resolveLayerAtTime(layer, timeMs), assetUrl)
            : null,
        )}
        {!hideCaption && resolved.page ? (
          <g opacity={resolved.opacity}>
            <rect
              x={caption.x}
              y={caption.y}
              width={caption.width}
              height={caption.height}
              rx={caption.border_radius}
              fill={caption.background_color}
              fillOpacity={caption.background_opacity}
            />
            <text
              x={textX}
              y={firstBaseline}
              fill={caption.text_color}
              fontFamily={caption.font_family}
              fontSize={caption.font_size}
              fontWeight={caption.font_weight ?? 600}
              textAnchor={textAnchor}
            >
              {resolved.lines.map((line, index) => (
                <tspan
                  key={`${index}-${line}`}
                  x={textX}
                  dy={index === 0 ? 0 : caption.font_size * caption.line_height}
                >
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        ) : null}
      </g>
    </svg>
  );
}
