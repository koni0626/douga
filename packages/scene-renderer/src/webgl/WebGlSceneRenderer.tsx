import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { ProjectDocument } from "@douga/project-schema";

import { SceneRenderer } from "../SceneRenderer";
import {
  WebGlProjectRenderer,
  projectRenderAssetIds,
  type WebGlAssetUrlResolver,
} from "./WebGlProjectRenderer";

export interface WebGlSceneRendererProps {
  project: ProjectDocument;
  sceneIndex?: number;
  timeMs: number;
  assetUrl: WebGlAssetUrlResolver;
  className?: string;
  style?: CSSProperties;
  hideCaption?: boolean;
  showFullText?: boolean;
  onError?: (error: Error) => void;
}

export function WebGlSceneRenderer({
  project,
  sceneIndex = 0,
  timeMs,
  assetUrl,
  className,
  style,
  hideCaption = false,
  showFullText = false,
  onError,
}: WebGlSceneRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WebGlProjectRenderer | undefined>(undefined);
  const preparationProjectRef = useRef(project);
  preparationProjectRef.current = project;
  const assetSignature = useMemo(
    () =>
      projectRenderAssetIds(project)
        .map((assetId) => `${assetId}:${assetUrl(assetId) ?? ""}`)
        .join("|"),
    [assetUrl, project],
  );
  const [preparedRevision, setPreparedRevision] = useState(0);
  const [webGlUnavailable, setWebGlUnavailable] = useState(false);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: WebGlProjectRenderer;
    try {
      renderer = new WebGlProjectRenderer(
        canvas,
        project.video.width,
        project.video.height,
      );
      setWebGlUnavailable(false);
    } catch (error) {
      setWebGlUnavailable(true);
      onError?.(
        error instanceof Error ? error : new Error("WebGL 2 is unavailable"),
      );
      return;
    }
    renderer.resize(
      project.video.width,
      project.video.height,
      project.video.width,
      project.video.height,
    );
    rendererRef.current = renderer;
    return () => {
      renderer.dispose();
      rendererRef.current = undefined;
    };
  }, [onError, project.video.height, project.video.width]);

  useEffect(() => {
    let canceled = false;
    const renderer = rendererRef.current;
    if (!renderer) return;
    void Promise.all([
      document.fonts.ready,
      renderer.prepare(preparationProjectRef.current, assetUrl),
    ])
      .then(() => {
        if (!canceled) setPreparedRevision((current) => current + 1);
      })
      .catch((error: unknown) => {
        if (!canceled) {
          setWebGlUnavailable(true);
          onError?.(
            error instanceof Error
              ? error
              : new Error("WebGL asset preparation failed"),
          );
        }
      });
    return () => {
      canceled = true;
    };
  }, [assetSignature, assetUrl, onError]);

  useEffect(() => {
    rendererRef.current?.renderFrame(project, sceneIndex, timeMs, {
      hideCaption,
      showFullText,
    });
  }, [
    hideCaption,
    preparedRevision,
    project,
    sceneIndex,
    showFullText,
    timeMs,
  ]);

  if (webGlUnavailable) {
    return (
      <SceneRenderer
        assetUrl={assetUrl}
        className={className}
        hideCaption={hideCaption}
        project={project}
        sceneIndex={sceneIndex}
        showFullText={showFullText}
        style={style}
        timeMs={timeMs}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-label={project.name}
      className={className}
      data-render-canvas
      data-render-engine="webgl"
      height={project.video.height}
      role="img"
      style={style}
      width={project.video.width}
    />
  );
}
