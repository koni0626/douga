import type { ProjectDocument } from "@douga/project-schema";

export type Scene = ProjectDocument["scenes"][number];
export type Layer = Scene["layers"][number];
export type Dialogue = Scene["dialogues"][number];
export type AudioTrack = NonNullable<ProjectDocument["audio_tracks"]>[number];
export type CameraEffect = NonNullable<
  ProjectDocument["camera_effects"]
>[number];
export type CameraPreset = CameraEffect["preset"];
export type EditorTool =
  "dialogues" | "layers" | "camera" | "audio" | "caption";
export type SaveState =
  "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";
