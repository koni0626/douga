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
  const [search, setSearch] = useState("");
  const [errorKey, setErrorKey] = useState<string>();

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

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
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
      setErrorKey(
        error instanceof ApiError ? error.messageKey : "errors.unknown",
      );
    }
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

  async function exportProject(projectId: string) {
    await apiRequest<ExportDto>("/exports", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId }),
    });
    navigate("/exports");
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
        <form
          className="project-create-form"
          onSubmit={(event) => void create(event)}
        >
          <label className="sr-only" htmlFor="new-project-name">
            {t("projects.newName")}
          </label>
          <input
            id="new-project-name"
            value={name}
            maxLength={200}
            placeholder={t("projects.newName")}
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
          <button type="submit">
            <span aria-hidden="true">＋</span>
            {t("projects.create")}
          </button>
        </form>
      </header>

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
        <div className="project-grid">
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
                <Link to={`/projects/${project.id}`}>
                  <h2>{project.name}</h2>
                </Link>
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
                      onClick={() => void exportProject(project.id)}
                    >
                      {t("projects.export")}
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
