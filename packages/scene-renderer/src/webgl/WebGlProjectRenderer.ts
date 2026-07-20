import type { ProjectDocument } from "@douga/project-schema";

import { resolveLayerAtTime } from "../animation";
import { resolveCameraTransform, type CameraTransform } from "../camera";
import { buildSceneTimeline, resolveCaptionAtTime } from "../layout";
import { visibleTextAtTime } from "../text";
import { isLayerVisibleAtTime } from "../visibility";
import {
  buildQuadVertices,
  coverTextureCoordinates,
  type Rectangle,
} from "./geometry";
import { WebGlSurface, type SurfaceTexture } from "./surface";
import {
  captionRasterKey,
  rasterizeCaption,
  rasterizeTextLayer,
  textLayerRasterKey,
} from "./text-rasterizer";

type Scene = ProjectDocument["scenes"][number];
type Layer = Scene["layers"][number];
export type WebGlAssetUrlResolver = (assetId: string) => string | undefined;

export interface WebGlRenderFrameOptions {
  hideCaption?: boolean;
  showFullText?: boolean;
}

interface AssetTexture extends SurfaceTexture {
  url: string;
}

export function projectRenderAssetIds(project: ProjectDocument) {
  const assetIds = new Set<string>();
  for (const scene of project.scenes) {
    if (scene.background.type === "asset") {
      assetIds.add(scene.background.asset_id);
    }
    for (const layer of scene.layers) {
      if (layer.type === "image") assetIds.add(layer.asset_id);
    }
  }
  return [...assetIds].sort();
}

function parseColor(
  value: string,
  opacity = 1,
): [number, number, number, number] {
  const normalized = value.match(/^#([\da-f]{3}|[\da-f]{6})$/iu)?.[1];
  if (!normalized) return [1, 1, 1, Math.max(0, Math.min(1, opacity))];
  const hex =
    normalized.length === 3
      ? [...normalized].map((part) => `${part}${part}`).join("")
      : normalized;
  return [
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
    Math.max(0, Math.min(1, opacity)),
  ];
}

function layerRectangle(layer: Layer): Rectangle {
  return {
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    rotation: layer.rotation,
    flipX: layer.flip_x,
    flipY: layer.flip_y,
  };
}

export class WebGlProjectRenderer {
  private readonly surface: WebGlSurface;
  private readonly assetTextures = new Map<string, AssetTexture>();
  private readonly rasterTextures = new Map<string, SurfaceTexture>();
  private captionTimelineCache?: {
    scene: Scene;
    style: ProjectDocument["caption_style"];
    locale: ProjectDocument["content_locale"];
    timeline: ReturnType<typeof buildSceneTimeline>;
  };
  private logicalWidth: number;
  private logicalHeight: number;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    logicalWidth: number,
    logicalHeight: number,
  ) {
    this.surface = new WebGlSurface(canvas);
    this.logicalWidth = logicalWidth;
    this.logicalHeight = logicalHeight;
  }

  resize(
    outputWidth: number,
    outputHeight: number,
    logicalWidth = this.logicalWidth,
    logicalHeight = this.logicalHeight,
  ) {
    this.logicalWidth = logicalWidth;
    this.logicalHeight = logicalHeight;
    this.surface.resize(outputWidth, outputHeight);
  }

  async prepare(project: ProjectDocument, assetUrl: WebGlAssetUrlResolver) {
    // Decode and upload one image at a time. Large projects otherwise keep all
    // decoded ImageBitmaps alive until Promise.all settles, temporarily using
    // roughly twice the final GPU/image memory and losing the WebGL context on
    // memory-constrained browser sessions.
    for (const assetId of projectRenderAssetIds(project)) {
      const url = assetUrl(assetId);
      if (!url || this.assetTextures.get(assetId)?.url === url) continue;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok)
        throw new Error(`Unable to load render asset (${response.status})`);
      const bitmap = await createImageBitmap(await response.blob());
      try {
        const existing = this.assetTextures.get(assetId);
        if (existing) this.surface.deleteTexture(existing);
        this.assetTextures.set(assetId, {
          ...this.surface.createTexture(bitmap),
          url,
        });
      } finally {
        bitmap.close();
      }
    }
  }

  renderFrame(
    project: ProjectDocument,
    sceneIndex: number,
    timeMs: number,
    options: WebGlRenderFrameOptions = {},
  ) {
    const scene = project.scenes[sceneIndex];
    if (!scene) return;
    const camera = resolveCameraTransform(project.camera_effects ?? [], timeMs);
    this.surface.clear();
    this.drawBackground(scene, camera);
    for (const layer of scene.layers) {
      if (!isLayerVisibleAtTime(layer, timeMs)) continue;
      this.drawLayer(
        resolveLayerAtTime(layer, timeMs),
        timeMs,
        camera,
        options.showFullText ?? false,
      );
    }
    if (!options.hideCaption) this.drawCaption(project, scene, timeMs, camera);
  }

  dispose() {
    for (const texture of this.assetTextures.values()) {
      this.surface.deleteTexture(texture);
    }
    for (const texture of this.rasterTextures.values()) {
      this.surface.deleteTexture(texture);
    }
    this.assetTextures.clear();
    this.rasterTextures.clear();
    this.surface.dispose();
  }

  private drawBackground(scene: Scene, camera: CameraTransform) {
    const fallbackColor =
      scene.background.type === "color"
        ? scene.background.color
        : (scene.background.fallback_color ?? "#111827");
    const rectangle = {
      x: 0,
      y: 0,
      width: this.logicalWidth,
      height: this.logicalHeight,
    };
    this.drawSolid(rectangle, fallbackColor, 1, camera);
    if (scene.background.type !== "asset") return;
    const texture = this.assetTextures.get(scene.background.asset_id);
    if (!texture) return;
    this.drawTexture(texture, rectangle, 1, camera, true);
  }

  private drawLayer(
    layer: Layer,
    timeMs: number,
    camera: CameraTransform,
    showFullText: boolean,
  ) {
    const rectangle = layerRectangle(layer);
    if (layer.type === "image") {
      const texture = this.assetTextures.get(layer.asset_id);
      if (texture)
        this.drawTexture(texture, rectangle, layer.opacity, camera, true);
      return;
    }
    if (layer.type === "shape") {
      this.drawSolid(
        rectangle,
        layer.fill,
        layer.opacity,
        camera,
        layer.shape === "ellipse",
      );
      return;
    }
    const text = visibleTextAtTime(layer, timeMs, showFullText);
    const cacheKey = textLayerRasterKey(layer, text, this.pixelScale());
    const cached = this.rasterTextures.get(cacheKey);
    if (cached) {
      this.drawTexture(cached, rectangle, layer.opacity, camera);
      return;
    }
    const rasterized = rasterizeTextLayer(layer, text, this.pixelScale());
    const texture = this.rasterTexture(rasterized.cacheKey, rasterized.canvas);
    this.drawTexture(texture, rectangle, layer.opacity, camera);
  }

  private drawCaption(
    project: ProjectDocument,
    scene: Scene,
    timeMs: number,
    camera: CameraTransform,
  ) {
    const timeline = this.captionTimeline(project, scene);
    const resolved = resolveCaptionAtTime(timeline, timeMs);
    if (!resolved.page) return;
    const cacheKey = captionRasterKey(
      project.caption_style,
      resolved,
      this.pixelScale(),
    );
    const cached = this.rasterTextures.get(cacheKey);
    if (cached) {
      this.drawTexture(
        cached,
        {
          x: project.caption_style.x,
          y: project.caption_style.y,
          width: project.caption_style.width,
          height: project.caption_style.height,
        },
        resolved.opacity,
        camera,
      );
      return;
    }
    const rasterized = rasterizeCaption(
      project.caption_style,
      resolved,
      this.pixelScale(),
    );
    if (!rasterized) return;
    const texture = this.rasterTexture(rasterized.cacheKey, rasterized.canvas);
    this.drawTexture(
      texture,
      {
        x: project.caption_style.x,
        y: project.caption_style.y,
        width: project.caption_style.width,
        height: project.caption_style.height,
      },
      resolved.opacity,
      camera,
    );
  }

  private drawSolid(
    rectangle: Rectangle,
    color: string,
    opacity: number,
    camera: CameraTransform,
    ellipse = false,
  ) {
    this.surface.draw(
      this.surface.whiteTexture,
      buildQuadVertices(
        rectangle,
        camera,
        this.logicalWidth,
        this.logicalHeight,
      ),
      parseColor(color, opacity),
      ellipse,
    );
  }

  private drawTexture(
    texture: SurfaceTexture,
    rectangle: Rectangle,
    opacity: number,
    camera: CameraTransform,
    cover = false,
  ) {
    const coordinates = cover
      ? coverTextureCoordinates(
          texture.width,
          texture.height,
          rectangle.width,
          rectangle.height,
        )
      : undefined;
    this.surface.draw(
      texture,
      buildQuadVertices(
        rectangle,
        camera,
        this.logicalWidth,
        this.logicalHeight,
        coordinates,
      ),
      [1, 1, 1, Math.max(0, Math.min(1, opacity))],
    );
  }

  private rasterTexture(cacheKey: string, source: HTMLCanvasElement) {
    const cached = this.rasterTextures.get(cacheKey);
    if (cached) return cached;
    const texture = this.surface.createTexture(source);
    this.rasterTextures.set(cacheKey, texture);
    if (this.rasterTextures.size > 128) {
      const oldestKey = this.rasterTextures.keys().next().value as
        string | undefined;
      if (oldestKey) {
        const oldest = this.rasterTextures.get(oldestKey);
        if (oldest) this.surface.deleteTexture(oldest);
        this.rasterTextures.delete(oldestKey);
      }
    }
    return texture;
  }

  private captionTimeline(project: ProjectDocument, scene: Scene) {
    const cached = this.captionTimelineCache;
    if (
      cached?.scene === scene &&
      cached.style === project.caption_style &&
      cached.locale === project.content_locale
    ) {
      return cached.timeline;
    }
    const timeline = buildSceneTimeline(
      scene,
      project.caption_style,
      project.content_locale,
    );
    this.captionTimelineCache = {
      scene,
      style: project.caption_style,
      locale: project.content_locale,
      timeline,
    };
    return timeline;
  }

  private pixelScale() {
    return Math.max(
      0.25,
      Math.min(
        2,
        Math.max(
          this.canvas.width / this.logicalWidth,
          this.canvas.height / this.logicalHeight,
        ),
      ),
    );
  }
}
