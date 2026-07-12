import type { ProjectDocument } from "@douga/project-schema";
import { buildSceneTimeline } from "@douga/scene-renderer";

type Scene = ProjectDocument["scenes"][number];
type CaptionStyle = ProjectDocument["caption_style"];
type ContentLocale = ProjectDocument["content_locale"];

export interface CaptionTimelineClip {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
}

export function buildCaptionTimelineClips(
  scene: Scene,
  style: CaptionStyle,
  locale: ContentLocale,
): CaptionTimelineClip[] {
  const clips = new Map<string, CaptionTimelineClip>();

  for (const page of buildSceneTimeline(scene, style, locale)) {
    const current = clips.get(page.dialogueId);
    if (current) {
      current.startMs = Math.min(current.startMs, page.startMs);
      current.endMs = Math.max(current.endMs, page.endMs);
      continue;
    }
    clips.set(page.dialogueId, {
      id: page.dialogueId,
      text: page.dialogue.text,
      startMs: page.startMs,
      endMs: page.endMs,
    });
  }

  return [...clips.values()].sort(
    (left, right) => left.startMs - right.startMs,
  );
}
