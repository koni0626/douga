import type { ProjectDocument } from "@douga/project-schema";

let cachedWebGlSupport: boolean | undefined;

export function browserExportSupported(project: ProjectDocument): boolean {
  if (
    typeof document === "undefined" ||
    typeof VideoEncoder === "undefined" ||
    typeof createImageBitmap === "undefined"
  ) {
    return false;
  }
  if (cachedWebGlSupport === undefined) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2");
    cachedWebGlSupport = context !== null;
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  }
  if (!cachedWebGlSupport) return false;
  if ((project.audio_tracks?.length ?? 0) > 0) {
    return (
      typeof AudioEncoder !== "undefined" &&
      typeof AudioContext !== "undefined" &&
      typeof OfflineAudioContext !== "undefined"
    );
  }
  return true;
}
