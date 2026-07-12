import { useEffect, useRef, useState } from "react";

import type { ProjectDocument } from "@douga/project-schema";

import {
  ApiError,
  apiRequest,
  type AssetDto,
  type AssetListDto,
  type ProjectDetailDto,
} from "../../../shared/lib/api";
import type { SaveState, Scene } from "../lib/editorTypes";

function ensureCanvas(document: ProjectDocument): ProjectDocument {
  if (document.scenes.length > 0) return document;
  return {
    ...document,
    scenes: [
      {
        id: crypto.randomUUID(),
        name: "Canvas",
        background: { type: "color", color: "#16324f" },
        layers: [],
        dialogues: [],
      },
    ],
  };
}

export function useProjectDocumentEditor(projectId?: string) {
  const [detail, setDetail] = useState<ProjectDetailDto>();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [assets, setAssets] = useState<AssetDto[]>([]);
  const documentRef = useRef<ProjectDocument | undefined>(undefined);
  const pastRef = useRef<ProjectDocument[]>([]);
  const futureRef = useRef<ProjectDocument[]>([]);
  const changeSequenceRef = useRef(0);
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    void Promise.all([
      apiRequest<ProjectDetailDto>(`/projects/${projectId}`),
      apiRequest<AssetListDto>("/assets?status=ready"),
    ])
      .then(([result, assetList]) => {
        if (!active) return;
        const document = ensureCanvas(result.document);
        setDetail({ ...result, document });
        documentRef.current = document;
        if (document !== result.document) setSaveState("dirty");
        setAssets(assetList.items);
      })
      .catch(() => {
        if (active) setSaveState("error");
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (
      saveState !== "dirty" ||
      !detail ||
      !projectId ||
      saveInFlightRef.current
    )
      return;
    const timer = globalThis.setTimeout(() => {
      const documentToSave = documentRef.current;
      if (!documentToSave) return;
      const savingSequence = changeSequenceRef.current;
      saveInFlightRef.current = true;
      setSaveState("saving");
      void apiRequest<ProjectDetailDto>(`/projects/${projectId}/revisions`, {
        method: "POST",
        body: JSON.stringify({
          lock_version: detail.project.lock_version,
          document: documentToSave,
          change_summary: "auto save",
        }),
      })
        .then((saved) => {
          saveInFlightRef.current = false;
          if (changeSequenceRef.current === savingSequence) {
            setDetail(saved);
            documentRef.current = saved.document;
            setSaveState("saved");
            return;
          }
          const currentDocument = documentRef.current;
          setDetail(
            currentDocument ? { ...saved, document: currentDocument } : saved,
          );
          setSaveState("dirty");
        })
        .catch((error: unknown) => {
          saveInFlightRef.current = false;
          setSaveState(
            error instanceof ApiError && error.status === 409
              ? "conflict"
              : "error",
          );
        });
    }, 800);
    return () => globalThis.clearTimeout(timer);
  }, [detail, projectId, saveState]);

  function applyDocument(document: ProjectDocument, recordHistory = true) {
    const previousDocument = documentRef.current;
    if (!previousDocument) return;
    if (recordHistory) {
      pastRef.current = [...pastRef.current.slice(-49), previousDocument];
      futureRef.current = [];
    }
    changeSequenceRef.current += 1;
    documentRef.current = document;
    setDetail((current) => (current ? { ...current, document } : current));
    setSaveState("dirty");
  }

  function mutate(mutator: (document: ProjectDocument) => void) {
    const currentDocument = documentRef.current;
    if (!currentDocument) return;
    const document = structuredClone(currentDocument);
    mutator(document);
    applyDocument(document);
  }

  function updateScene(mutator: (scene: Scene) => void) {
    mutate((document) => {
      const scene = document.scenes[0];
      if (scene) mutator(scene);
    });
  }

  function undo() {
    if (!detail || pastRef.current.length === 0) return;
    const previous = pastRef.current.at(-1);
    if (!previous) return;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [detail.document, ...futureRef.current].slice(0, 50);
    applyDocument(previous, false);
  }

  function redo() {
    if (!detail || futureRef.current.length === 0) return;
    const [next, ...rest] = futureRef.current;
    if (!next) return;
    futureRef.current = rest;
    pastRef.current = [...pastRef.current, detail.document].slice(-50);
    applyDocument(next, false);
  }

  async function refresh() {
    if (!projectId) return;
    try {
      const result = await apiRequest<ProjectDetailDto>(
        `/projects/${projectId}`,
      );
      const document = ensureCanvas(result.document);
      documentRef.current = document;
      pastRef.current = [];
      futureRef.current = [];
      setDetail({ ...result, document });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  return {
    assets,
    detail,
    documentRef,
    mutate,
    redo,
    refresh,
    saveState,
    setAssets,
    undo,
    updateScene,
  };
}
