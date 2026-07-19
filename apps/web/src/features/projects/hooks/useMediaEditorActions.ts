import {
  type Dispatch,
  type DragEvent,
  type MutableRefObject,
  type SetStateAction,
  useEffect,
  useState,
} from "react";

import type { ProjectDocument } from "@douga/project-schema";

import { uploadAsset } from "../../assets/lib/uploadAsset";
import { ApiError, type AssetDto } from "../../../shared/lib/api";
import type {
  AudioTrack,
  CameraEffect,
  CameraPreset,
  EditorTool,
} from "../lib/editorTypes";

export interface MediaEditorActionsOptions {
  addUploadedImageLayer: (asset: AssetDto, sceneId: string) => void;
  documentRef: MutableRefObject<ProjectDocument | undefined>;
  durationMs: number;
  mutate: (mutator: (document: ProjectDocument) => void) => void;
  setActiveTool: Dispatch<SetStateAction<EditorTool | null>>;
  setAssets: Dispatch<SetStateAction<AssetDto[]>>;
}

export function useMediaEditorActions({
  addUploadedImageLayer,
  documentRef,
  durationMs,
  mutate,
  setActiveTool,
  setAssets,
}: MediaEditorActionsOptions) {
  const [dropActive, setDropActive] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [audioDropActive, setAudioDropActive] = useState(false);
  const [uploadErrorKey, setUploadErrorKey] = useState<string>();

  function addAudioTrack(
    asset: AssetDto,
    startMs = 0,
    role: AudioTrack["role"] = "bgm",
    speechSynthesis?: AudioTrack["speech_synthesis"],
  ) {
    mutate((document) => {
      document.audio_tracks ??= [];
      document.audio_tracks.push({
        id: crypto.randomUUID(),
        asset_id: asset.id,
        role,
        scene_id: null,
        dialogue_id: null,
        start_ms: startMs,
        duration_ms: asset.duration_ms ?? undefined,
        trim_start_ms: 0,
        volume: role === "bgm" ? 0.7 : 1,
        loop: false,
        fade_in_ms: 0,
        fade_out_ms: 0,
        ducking: role === "bgm",
        speech_synthesis: speechSynthesis,
      });
    });
  }

  async function uploadImage(file: File, sceneId: string) {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setUploadErrorKey("errors.imageUploadOnly");
      return;
    }
    setUploadingImage(true);
    setUploadErrorKey(undefined);
    try {
      const completed = await uploadAsset(file, "image");
      setAssets((current) => [completed, ...current]);
      addUploadedImageLayer(completed, sceneId);
    } catch (error) {
      setUploadErrorKey(errorKey(error));
    } finally {
      setUploadingImage(false);
    }
  }

  async function uploadAudio(file: File, startMs: number) {
    const isMp3 =
      file.type === "audio/mpeg" || file.name.toLowerCase().endsWith(".mp3");
    if (!isMp3) {
      setUploadErrorKey("errors.audioUploadOnly");
      return;
    }
    setUploadingAudio(true);
    setUploadErrorKey(undefined);
    try {
      const completed = await uploadAsset(file, "audio");
      setAssets((current) => [completed, ...current]);
      addAudioTrack(completed, startMs);
      setActiveTool("audio");
    } catch (error) {
      setUploadErrorKey(errorKey(error));
    } finally {
      setUploadingAudio(false);
      setAudioDropActive(false);
    }
  }

  function dropImage(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDropActive(false);
    if (uploadingImage) return;
    const sceneId = documentRef.current?.scenes[0]?.id;
    const file = event.dataTransfer.files.item(0);
    if (file && sceneId) void uploadImage(file, sceneId);
  }

  function dropAudioOnTimeline(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setAudioDropActive(false);
    if (uploadingAudio) return;
    const file = event.dataTransfer.files.item(0);
    if (!file) return;
    const ruler = event.currentTarget.querySelector<HTMLElement>(
      ".object-timeline-ruler",
    );
    const bounds = ruler?.getBoundingClientRect();
    const startMs = bounds
      ? Math.max(
          0,
          Math.min(
            durationMs - 1,
            Math.round(
              ((event.clientX - bounds.left) / bounds.width) * durationMs,
            ),
          ),
        )
      : 0;
    void uploadAudio(file, startMs);
  }

  useEffect(() => {
    const pasteImage = (event: ClipboardEvent) => {
      if (isEditableShortcutTarget(event.target) || uploadingImage) return;
      const sceneId = documentRef.current?.scenes[0]?.id;
      const file = clipboardImageFile(event);
      if (!sceneId || !file) return;
      event.preventDefault();
      void uploadImage(file, sceneId);
    };
    window.addEventListener("paste", pasteImage);
    return () => window.removeEventListener("paste", pasteImage);
  }, [addUploadedImageLayer, documentRef, setAssets, uploadingImage]);

  function addCameraEffect(preset: CameraPreset) {
    mutate((document) => {
      document.camera_effects ??= [];
      document.camera_effects.push({
        id: crypto.randomUUID(),
        preset,
        start_ms: 0,
        end_ms: durationMs,
        intensity: 1,
        period_ms: preset === "handheld" ? 900 : preset === "walk" ? 700 : 4000,
      });
    });
  }

  function updateCameraEffect(effectId: string, patch: Partial<CameraEffect>) {
    mutate((document) => {
      const effect = document.camera_effects?.find(
        (item) => item.id === effectId,
      );
      if (effect) Object.assign(effect, patch);
    });
  }

  function deleteCameraEffect(effectId: string) {
    mutate((document) => {
      document.camera_effects = document.camera_effects?.filter(
        (effect) => effect.id !== effectId,
      );
    });
  }

  function updateAudioTrack(trackId: string, patch: Partial<AudioTrack>) {
    mutate((document) => {
      const track = document.audio_tracks?.find((item) => item.id === trackId);
      if (track) Object.assign(track, patch);
    });
  }

  function deleteAudioTrack(trackId: string) {
    mutate((document) => {
      document.audio_tracks = document.audio_tracks?.filter(
        (track) => track.id !== trackId,
      );
    });
  }

  return {
    addAudioTrack,
    addCameraEffect,
    audioDropActive,
    deleteAudioTrack,
    deleteCameraEffect,
    dropActive,
    dropAudioOnTimeline,
    dropImage,
    setAudioDropActive,
    setDropActive,
    updateAudioTrack,
    updateCameraEffect,
    uploadErrorKey,
    uploadingAudio,
    uploadingImage,
  };
}

function errorKey(error: unknown): string {
  return error instanceof ApiError ? error.messageKey : "errors.unknown";
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches("input, textarea, select"))
  );
}

function clipboardImageFile(event: ClipboardEvent): File | undefined {
  const file = Array.from(event.clipboardData?.items ?? [])
    .find((item) => item.kind === "file" && item.type.startsWith("image/"))
    ?.getAsFile();
  if (!file) return undefined;
  if (file.name && file.name !== "image") return file;
  const extension =
    file.type === "image/jpeg"
      ? "jpg"
      : file.type === "image/webp"
        ? "webp"
        : "png";
  return new File([file], `clipboard-${Date.now()}.${extension}`, {
    type: file.type || "image/png",
  });
}
