import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useTranslation } from "react-i18next";

import type { ProjectDocument } from "@douga/project-schema";
import {
  buildSceneTimeline,
  resolveCaptionAtTime,
} from "@douga/scene-renderer";

import type { Dialogue, Scene } from "../lib/editorTypes";
import type { TimelineRange } from "../lib/timelineRange";

export interface CaptionEditorActionsOptions {
  captionDraft: string;
  documentRef: MutableRefObject<ProjectDocument | undefined>;
  sceneIndex: number;
  setCaptionEditing: Dispatch<SetStateAction<boolean>>;
  timeMs: number;
  updateScene: (mutator: (scene: Scene) => void) => void;
}

export function useCaptionEditorActions({
  captionDraft,
  documentRef,
  sceneIndex,
  setCaptionEditing,
  timeMs,
  updateScene,
}: CaptionEditorActionsOptions) {
  const { t } = useTranslation();

  function addDialogue() {
    updateScene((scene) =>
      scene.dialogues.push({
        id: crypto.randomUUID(),
        speaker: null,
        text: t("editor.newDialogue"),
        display_effect: "typewriter",
        duration_mode: "auto",
        duration_ms: null,
        manual_page_breaks: [],
      }),
    );
  }

  function addCaptionAt(startMs: number) {
    updateScene((scene) => {
      scene.dialogues.push({
        id: crypto.randomUUID(),
        speaker: null,
        start_ms: Math.max(0, Math.round(startMs / 50) * 50),
        text: t("editor.newDialogue"),
        display_effect: "instant",
        duration_mode: "manual",
        duration_ms: 3000,
        manual_page_breaks: [],
      });
      sortDialogues(scene);
    });
  }

  function updateCaptionRange(dialogueId: string, range: TimelineRange) {
    updateScene((scene) => {
      const dialogue = scene.dialogues.find((item) => item.id === dialogueId);
      if (!dialogue) return;
      dialogue.start_ms = range.startMs;
      dialogue.duration_mode = "manual";
      dialogue.duration_ms = Math.max(250, range.endMs - range.startMs);
      sortDialogues(scene);
    });
  }

  function deleteCaption(dialogueId: string) {
    updateScene((scene) => {
      scene.dialogues = scene.dialogues.filter(
        (dialogue) => dialogue.id !== dialogueId,
      );
    });
  }

  function commitInlineCaption() {
    const text = captionDraft.trim();
    if (!text) {
      setCaptionEditing(false);
      return;
    }
    const document = documentRef.current;
    const currentScene = document?.scenes[sceneIndex];
    if (!document || !currentScene) return;
    const currentPage = resolveCaptionAtTime(
      buildSceneTimeline(
        currentScene,
        document.caption_style,
        document.content_locale,
      ),
      timeMs,
    ).page;
    updateScene((scene) => {
      const dialogue = currentPage
        ? scene.dialogues.find((item) => item.id === currentPage.dialogueId)
        : undefined;
      if (dialogue) dialogue.text = text;
      else
        scene.dialogues.push({
          id: crypto.randomUUID(),
          speaker: null,
          start_ms: Math.round(timeMs),
          text,
          display_effect: "typewriter",
          duration_mode: "auto",
          duration_ms: null,
          manual_page_breaks: [],
        });
    });
    setCaptionEditing(false);
  }

  function updateDialogue(dialogueId: string, patch: Partial<Dialogue>) {
    updateScene((scene) => {
      const dialogue = scene.dialogues.find((item) => item.id === dialogueId);
      if (dialogue) Object.assign(dialogue, patch);
    });
  }

  return {
    addCaptionAt,
    addDialogue,
    commitInlineCaption,
    deleteCaption,
    updateCaptionRange,
    updateDialogue,
  };
}

function sortDialogues(scene: Scene) {
  scene.dialogues.sort(
    (left, right) => (left.start_ms ?? 0) - (right.start_ms ?? 0),
  );
}
