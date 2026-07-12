import type { ProjectDocument } from "@douga/project-schema";

import { buildSceneTimeline } from "./layout";

export const MIN_VIDEO_DURATION_MS = 5_000;
export const VIDEO_DURATION_STEP_MS = 5_000;

export function roundVideoDurationMs(durationMs: number): number {
  return Math.max(
    MIN_VIDEO_DURATION_MS,
    Math.ceil(durationMs / VIDEO_DURATION_STEP_MS) * VIDEO_DURATION_STEP_MS,
  );
}

export function resolveSceneDurationMs(
  project: ProjectDocument,
  sceneIndex = 0,
): number {
  const scene = project.scenes[sceneIndex];
  if (!scene) return roundVideoDurationMs(project.video.duration_ms ?? 0);

  const captionTimeline = buildSceneTimeline(
    scene,
    project.caption_style,
    project.content_locale,
  );
  const captionEndMs = captionTimeline.at(-1)?.endMs ?? 0;
  const layerEndMs = scene.layers.reduce((maximum, layer) => {
    const keyframeEnd = Math.max(
      0,
      ...(layer.keyframes ?? []).map((keyframe) => keyframe.time_ms),
    );
    return Math.max(
      maximum,
      layer.start_ms ?? 0,
      layer.end_ms ?? 0,
      keyframeEnd,
    );
  }, 0);
  const audioEndMs = (project.audio_tracks ?? []).reduce((maximum, track) => {
    if (track.scene_id && track.scene_id !== scene.id) return maximum;
    return Math.max(maximum, track.start_ms + (track.duration_ms ?? 0));
  }, 0);

  return roundVideoDurationMs(
    Math.max(
      project.video.duration_ms ?? 0,
      captionEndMs,
      layerEndMs,
      audioEndMs,
    ),
  );
}
