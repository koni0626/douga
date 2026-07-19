import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import {
  ApiError,
  apiRequest,
  assetContentUrl,
  type ExportDto,
  type ProjectDetailDto,
  type ProjectListDto,
  type ProjectSummaryDto,
} from "../../../shared/lib/api";
import {
  ProjectExportDialog,
  type ProjectExportOptions,
} from "../components/ProjectExportDialog";

type ProjectAspectRatio = "16:9" | "9:16";

function ProjectThumbnail({
  project,
  labels,
}: {
  project: ProjectSummaryDto;
  labels: { noPreview: string; open: string; thumbnail: string };
}) {
  return (
    <Link className="project-thumbnail" to={`/projects/${project.id}`}>
      {project.thumbnail_asset_id ? (
        <img
          src={assetContentUrl(project.thumbnail_asset_id)}
          alt={labels.thumbnail}
        />
      ) : (
        <span className="project-thumbnail-fallback">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <rect x="6" y="10" width="36" height="28" rx="6" />
            <path d="m21 18 10 6-10 6z" />
          </svg>
          <small>{labels.noPreview}</small>
        </span>
      )}
      <span className="project-thumbnail-overlay">{labels.open}</span>
    </Link>
  );
}

export function ProjectListPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectListDto>();
  const [name, setName] = useState("");
  const [aspectRatio, setAspectRatio] = useState<ProjectAspectRatio>("16:9");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createErrorKey, setCreateErrorKey] = useState<string>();
  const [exportDetail, setExportDetail] = useState<ProjectDetailDto>();
  const [exporting, setExporting] = useState(false);
  const [exportErrorKey, setExportErrorKey] = useState<string>();
  const [loadingExportProjectId, setLoadingExportProjectId] =
    useState<string>();
  const [search, setSearch] = useState("");
  const [errorKey, setErrorKey] = useState<string>();
  const [editingProjectId, setEditingProjectId] = useState<string>();
  const [editingProjectName, setEditingProjectName] = useState("");
  const [renamingProjectId, setRenamingProjectId] = useState<string>();
  const [renameErrorKey, setRenameErrorKey] = useState<string>();

  async function load(query = search) {
    try {
      const result = await apiRequest<ProjectListDto>(
        `/projects${query ? `?search=${encodeURIComponent(query)}` : ""}`,
      );
      setProjects(result);
      setErrorKey(undefined);
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.messageKey : "errors.unknown",
      );
    }
  }

  useEffect(() => {
    void load("");
  }, []);

  useEffect(() => {
    if (!createDialogOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !creating) setCreateDialogOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [createDialogOpen, creating]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    setCreateErrorKey(undefined);
    try {
      const result = await apiRequest<ProjectDetailDto>("/projects", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          aspect_ratio: aspectRatio,
        }),
      });
      navigate(`/projects/${result.project.id}`);
    } catch (error) {
      setCreateErrorKey(
        error instanceof ApiError ? error.messageKey : "errors.unknown",
      );
    } finally {
      setCreating(false);
    }
  }

  function openCreateDialog() {
    setName("");
    setAspectRatio("16:9");
    setCreateErrorKey(undefined);
    setCreateDialogOpen(true);
  }

  async function duplicate(projectId: string) {
    await apiRequest<ProjectDetailDto>(`/projects/${projectId}/duplicate`, {
      method: "POST",
    });
    await load();
  }

  async function remove(projectId: string) {
    await apiRequest<void>(`/projects/${projectId}`, { method: "DELETE" });
    await load();
  }

  function startRenaming(project: ProjectSummaryDto) {
    setEditingProjectId(project.id);
    setEditingProjectName(project.name);
    setRenameErrorKey(undefined);
  }

  function cancelRenaming() {
    if (renamingProjectId) return;
    setEditingProjectId(undefined);
    setEditingProjectName("");
    setRenameErrorKey(undefined);
  }

  async function renameProject(event: FormEvent, project: ProjectSummaryDto) {
    event.preventDefault();
    const nextName = editingProjectName.trim();
    if (!nextName || renamingProjectId) return;

    if (nextName === project.name) {
      cancelRenaming();
      return;
    }

    setRenamingProjectId(project.id);
    setRenameErrorKey(undefined);
    try {
      const updatedProject = await apiRequest<ProjectSummaryDto>(
        `/projects/${project.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ name: nextName }),
        },
      );
      setProjects((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) =>
                item.id === updatedProject.id ? updatedProject : item,
              ),
            }
          : current,
      );
      setEditingProjectId(undefined);
      setEditingProjectName("");
    } catch (error) {
      setRenameErrorKey(
        error instanceof ApiError ? error.messageKey : "errors.unknown",
      );
    } finally {
      setRenamingProjectId(undefined);
    }
  }

  async function openExportDialog(projectId: string) {
    setLoadingExportProjectId(projectId);
    setExportErrorKey(undefined);
    try {
      setExportDetail(
        await apiRequest<ProjectDetailDto>(`/projects/${projectId}`),
      );
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.messageKey : "errors.unknown",
      );
    } finally {
      setLoadingExportProjectId(undefined);
    }
  }

  async function exportProject(options: ProjectExportOptions) {
    if (!exportDetail || exporting) return;
    setExporting(true);
    setExportErrorKey(undefined);
    try {
      await apiRequest<ExportDto>("/exports", {
        method: "POST",
        body: JSON.stringify({
          project_id: exportDetail.project.id,
          ...options,
        }),
      });
      setExportDetail(undefined);
      navigate("/exports");
    } catch (error) {
      setExportErrorKey(
        error instanceof ApiError ? error.messageKey : "errors.unknown",
      );
    } finally {
      setExporting(false);
    }
  }

  const dateFormatter = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <section className="projects-page">
      <header className="projects-page-header">
        <div>
          <p className="eyebrow">{t("projects.eyebrow")}</p>
          <h1>{t("projects.title")}</h1>
          <p className="projects-lead">{t("projects.lead")}</p>
        </div>
        <button
          type="button"
          className="project-create-button"
          onClick={openCreateDialog}
        >
          <span aria-hidden="true">＋</span>
          {t("projects.create")}
        </button>
        {createDialogOpen ? (
          <div
            className="project-create-dialog-backdrop"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget && !creating)
                setCreateDialogOpen(false);
            }}
          >
            <section
              aria-labelledby="project-create-dialog-title"
              aria-modal="true"
              className="project-create-dialog"
              role="dialog"
            >
              <h2 id="project-create-dialog-title">
                {t("projects.createDialogTitle")}
              </h2>
              <form onSubmit={(event) => void create(event)}>
                <label htmlFor="new-project-name">
                  {t("projects.newName")}
                </label>
                <input
                  autoFocus
                  id="new-project-name"
                  value={name}
                  maxLength={200}
                  onChange={(event) => setName(event.target.value)}
                />
                <fieldset className="project-aspect-picker">
                  <legend>{t("projects.aspectRatio")}</legend>
                  {(["16:9", "9:16"] as const).map((ratio) => (
                    <label
                      className={aspectRatio === ratio ? "selected" : undefined}
                      key={ratio}
                    >
                      <input
                        type="radio"
                        name="project-aspect-ratio"
                        value={ratio}
                        checked={aspectRatio === ratio}
                        onChange={() => setAspectRatio(ratio)}
                      />
                      <span
                        className={`project-aspect-icon ${ratio === "9:16" ? "portrait" : "landscape"}`}
                        aria-hidden="true"
                      />
                      <span>
                        <strong>{ratio}</strong>
                        <small>
                          {t(
                            ratio === "16:9"
                              ? "projects.aspectLandscape"
                              : "projects.aspectPortrait",
                          )}
                        </small>
                      </span>
                    </label>
                  ))}
                </fieldset>
                {createErrorKey ? (
                  <p role="alert" className="form-error">
                    {t(createErrorKey)}
                  </p>
                ) : null}
                <footer className="project-create-dialog-actions">
                  <button
                    type="button"
                    disabled={creating}
                    onClick={() => setCreateDialogOpen(false)}
                  >
                    {t("projects.cancel")}
                  </button>
                  <button
                    type="submit"
                    className="primary"
                    disabled={creating || !name.trim()}
                  >
                    <span aria-hidden="true">＋</span>
                    {t("projects.confirmCreate")}
                  </button>
                </footer>
              </form>
            </section>
          </div>
        ) : null}
      </header>

      {exportDetail ? (
        <ProjectExportDialog
          busy={exporting}
          detail={exportDetail}
          errorKey={exportErrorKey}
          onClose={() => {
            if (!exporting) setExportDetail(undefined);
          }}
          onExport={(options) => void exportProject(options)}
        />
      ) : null}

      <div className="projects-toolbar">
        <form
          className="project-search-form"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <span aria-hidden="true">⌕</span>
          <input
            aria-label={t("projects.search")}
            placeholder={t("projects.search")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button type="submit">{t("projects.searchAction")}</button>
        </form>
        {projects ? (
          <span className="projects-count">
            {t("projects.count", { count: projects.total })}
          </span>
        ) : null}
      </div>

      {errorKey ? (
        <p role="alert" className="form-error">
          {t(errorKey)}
        </p>
      ) : null}
      {!projects ? (
        <p>{t("loading")}</p>
      ) : projects.items.length === 0 ? (
        <p className="empty-state">{t("projects.empty")}</p>
      ) : (
        <div className="project-grid project-grid--projects">
          {projects.items.map((project) => (
            <article className="project-card" key={project.id}>
              <ProjectThumbnail
                project={project}
                labels={{
                  noPreview: t("projects.noPreview"),
                  open: t("projects.open"),
                  thumbnail: t("projects.thumbnail", { name: project.name }),
                }}
              />
              <div className="project-card-body">
                {editingProjectId === project.id ? (
                  <form
                    className="project-title-edit-form"
                    onSubmit={(event) => void renameProject(event, project)}
                  >
                    <input
                      autoFocus
                      aria-label={t("projects.renameInput")}
                      maxLength={200}
                      value={editingProjectName}
                      onChange={(event) =>
                        setEditingProjectName(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Escape") cancelRenaming();
                      }}
                    />
                    <button
                      type="submit"
                      className="primary"
                      disabled={
                        renamingProjectId === project.id ||
                        !editingProjectName.trim()
                      }
                    >
                      {t(
                        renamingProjectId === project.id
                          ? "projects.renameSaving"
                          : "projects.renameSave",
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={renamingProjectId === project.id}
                      onClick={cancelRenaming}
                    >
                      {t("projects.cancel")}
                    </button>
                  </form>
                ) : (
                  <div className="project-card-title-row">
                    <Link to={`/projects/${project.id}`}>
                      <h2>{project.name}</h2>
                    </Link>
                    <button
                      type="button"
                      className="project-rename-button"
                      aria-label={t("projects.rename")}
                      title={t("projects.rename")}
                      onClick={() => startRenaming(project)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m4 16.5-.75 4.25L7.5 20 18.35 9.15l-3.5-3.5L4 16.5Z" />
                        <path d="m13.75 6.75 3.5 3.5" />
                      </svg>
                    </button>
                  </div>
                )}
                {editingProjectId === project.id && renameErrorKey ? (
                  <p role="alert" className="form-error project-rename-error">
                    {t(renameErrorKey)}
                  </p>
                ) : null}
                <p className="project-updated">
                  {t("projects.updated", {
                    date: dateFormatter.format(new Date(project.updated_at)),
                  })}
                </p>
                <footer className="project-card-footer">
                  <span>
                    {t("projects.revision", {
                      count: project.current_revision_number,
                    })}
                  </span>
                  <div className="project-card-actions">
                    <button
                      type="button"
                      className="project-export-button"
                      disabled={loadingExportProjectId === project.id}
                      onClick={() => void openExportDialog(project.id)}
                    >
                      {t(
                        loadingExportProjectId === project.id
                          ? "projects.exportLoading"
                          : "projects.export",
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label={t("projects.duplicate")}
                      title={t("projects.duplicate")}
                      onClick={() => void duplicate(project.id)}
                    >
                      ⧉
                    </button>
                    <button
                      type="button"
                      className="danger"
                      aria-label={t("projects.delete")}
                      title={t("projects.delete")}
                      onClick={() => void remove(project.id)}
                    >
                      ×
                    </button>
                  </div>
                </footer>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
