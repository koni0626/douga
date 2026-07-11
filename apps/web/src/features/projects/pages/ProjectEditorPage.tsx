import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import type { ProjectDocument } from "@douga/project-schema";
import { SceneRenderer } from "@douga/scene-renderer";

import {
  ApiError,
  apiRequest,
  type ProjectDetailDto,
} from "../../../shared/lib/api";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";

export function ProjectEditorPage() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const [detail, setDetail] = useState<ProjectDetailDto>();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const documentRef = useRef<ProjectDocument | undefined>(undefined);

  useEffect(() => {
    if (!projectId) return;
    void apiRequest<ProjectDetailDto>(`/projects/${projectId}`)
      .then((result) => {
        setDetail(result);
        documentRef.current = result.document;
      })
      .catch(() => setSaveState("error"));
  }, [projectId]);

  useEffect(() => {
    if (saveState !== "dirty" || !detail || !projectId) return;
    const timer = globalThis.setTimeout(() => {
      setSaveState("saving");
      void apiRequest<ProjectDetailDto>(`/projects/${projectId}/revisions`, {
        method: "POST",
        body: JSON.stringify({
          lock_version: detail.project.lock_version,
          document: documentRef.current,
          change_summary: "auto save",
        }),
      })
        .then((saved) => {
          setDetail(saved);
          documentRef.current = saved.document;
          setSaveState("saved");
        })
        .catch((error: unknown) =>
          setSaveState(
            error instanceof ApiError && error.status === 409
              ? "conflict"
              : "error",
          ),
        );
    }, 800);
    return () => globalThis.clearTimeout(timer);
  }, [detail, projectId, saveState]);

  function addScene() {
    if (!detail) return;
    const document = structuredClone(detail.document);
    document.scenes.push({
      id: crypto.randomUUID(),
      name: t("editor.defaultSceneName", { count: document.scenes.length + 1 }),
      background: { type: "color", color: "#16324f" },
      layers: [],
      dialogues: [],
    });
    const updated = { ...detail, document };
    documentRef.current = document;
    setDetail(updated);
    setSaveState("dirty");
  }

  if (!detail)
    return (
      <main className="loading-screen">
        {t(saveState === "error" ? "errors.unknown" : "loading")}
      </main>
    );
  const project = detail.document;
  return (
    <main className="editor-shell">
      <header className="editor-toolbar">
        <Link to="/projects">{t("editor.back")}</Link>
        <h1>{detail.project.name}</h1>
        <span className={`save-state save-state--${saveState}`}>
          {t(`editor.saveState.${saveState}`)}
        </span>
        <button type="button" onClick={addScene}>
          {t("editor.addScene")}
        </button>
      </header>
      <div className="editor-body">
        <aside>
          <h2>{t("editor.scenes")}</h2>
          {project.scenes.map((scene, index) => (
            <div className="scene-row" key={scene.id}>
              {index + 1}. {scene.name}
            </div>
          ))}
        </aside>
        <section className="editor-preview">
          {project.scenes.length ? (
            <SceneRenderer project={project} timeMs={0} />
          ) : (
            <p>{t("editor.noScenes")}</p>
          )}
        </section>
      </div>
    </main>
  );
}
