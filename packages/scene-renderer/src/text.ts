import type { ProjectDocument } from "@douga/project-schema";

type Layer = ProjectDocument["scenes"][number]["layers"][number];
export type TextLayer = Extract<Layer, { type: "text" }>;

export const DEFAULT_TEXT_CHARACTERS_PER_SECOND = 16;

export function visibleTextAtTime(
  layer: TextLayer,
  timeMs: number,
  showFullText = false,
): string {
  if (showFullText) return layer.text;
  if ((layer.display_effect ?? "instant") !== "typewriter") return layer.text;
  const elapsedMs = Math.max(0, timeMs - (layer.start_ms ?? 0));
  const characters = Math.floor(
    (elapsedMs / 1000) *
      (layer.characters_per_second ?? DEFAULT_TEXT_CHARACTERS_PER_SECOND),
  );
  return Array.from(layer.text).slice(0, characters).join("");
}
