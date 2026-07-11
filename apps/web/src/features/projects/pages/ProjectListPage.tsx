import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import {
  ApiError,
  apiRequest,
  type ProjectDetailDto,
  type ProjectListDto,
} from "../../../shared/lib/api";

export function ProjectListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectListDto>();
  const [name, setName] = useState("");
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
        body: JSON.stringify({ name: name.trim() }),
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

  return (
    <section className="page-card projects-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("projects.eyebrow")}</p>
          <h1>{t("projects.title")}</h1>
        </div>
        <form className="inline-form" onSubmit={(event) => void create(event)}>
          <label>
            <span>{t("projects.newName")}</span>
            <input
              value={name}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button type="submit">{t("projects.create")}</button>
        </form>
      </div>
      <form
        className="search-form"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <input
          aria-label={t("projects.search")}
          placeholder={t("projects.search")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button type="submit">{t("projects.searchAction")}</button>
      </form>
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
              <Link to={`/projects/${project.id}`}>
                <h2>{project.name}</h2>
              </Link>
              <p>{t("projects.sceneCount", { count: project.scene_count })}</p>
              <p>
                {t("projects.revision", {
                  count: project.current_revision_number,
                })}
              </p>
              <div className="card-actions">
                <button
                  type="button"
                  onClick={() => void duplicate(project.id)}
                >
                  {t("projects.duplicate")}
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => void remove(project.id)}
                >
                  {t("projects.delete")}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
