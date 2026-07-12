import type { ProjectDocument } from "@douga/project-schema";

export type CameraEffect = NonNullable<
  ProjectDocument["camera_effects"]
>[number];
export type CameraTransform = {
  x: number;
  y: number;
  rotation: number;
  scale: number;
};

const TAU = Math.PI * 2;

export function resolveCameraTransform(
  effects: CameraEffect[],
  timeMs: number,
): CameraTransform {
  const result: CameraTransform = { x: 0, y: 0, rotation: 0, scale: 1 };
  for (const effect of effects) {
    if (timeMs < effect.start_ms || timeMs >= effect.end_ms) continue;
    const phase =
      ((timeMs - effect.start_ms) % effect.period_ms) / effect.period_ms;
    const wave = Math.sin(phase * TAU);
    const strength = effect.intensity;
    if (effect.preset === "handheld") {
      result.x +=
        (Math.sin(phase * TAU * 3.1) * 7 + Math.sin(phase * TAU * 7.3) * 3) *
        strength;
      result.y +=
        (Math.sin(phase * TAU * 4.7) * 6 + Math.cos(phase * TAU * 8.9) * 2) *
        strength;
      result.rotation += Math.sin(phase * TAU * 2.3) * 0.45 * strength;
      result.scale += 0.025 * strength;
    } else if (effect.preset === "walk") {
      result.x += Math.sin(phase * TAU) * 7 * strength;
      result.y += Math.abs(Math.sin(phase * TAU)) * 15 * strength;
      result.rotation += wave * 0.8 * strength;
      result.scale += 0.025 * strength;
    } else if (effect.preset === "breathe") {
      result.y += wave * 3 * strength;
      result.scale += ((wave + 1) / 2) * 0.025 * strength;
    } else if (effect.preset === "float") {
      result.x += Math.cos(phase * TAU) * 8 * strength;
      result.y += wave * 14 * strength;
      result.rotation += wave * 0.35 * strength;
      result.scale += 0.02 * strength;
    } else if (effect.preset === "sway") {
      result.x += wave * 24 * strength;
      result.rotation += wave * 0.7 * strength;
      result.scale += 0.025 * strength;
    } else if (effect.preset === "slow_rotate") {
      result.rotation += wave * 2.5 * strength;
      result.scale += 0.025 * strength;
    } else if (effect.preset === "zoom_pulse") {
      result.scale += ((wave + 1) / 2) * 0.06 * strength;
    } else {
      const beat1 = Math.max(0, Math.sin(phase * TAU * 2));
      const beat2 = Math.max(0, Math.sin((phase - 0.12) * TAU * 2));
      result.scale += Math.max(beat1, beat2 * 0.65) * 0.055 * strength;
    }
  }
  result.scale = Math.max(0.5, result.scale);
  return result;
}

export function cameraTransformValue(
  transform: CameraTransform,
  width: number,
  height: number,
): string {
  const centerX = width / 2;
  const centerY = height / 2;
  return `translate(${centerX + transform.x} ${centerY + transform.y}) rotate(${transform.rotation}) scale(${transform.scale}) translate(${-centerX} ${-centerY})`;
}
