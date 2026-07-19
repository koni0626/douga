import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  ApiError,
  apiRequest,
  exportContentUrl,
  type ExportListDto,
} from "../../../shared/lib/api";

export function ExportListPage() {
  const { t } = useTranslation();
  const [exports, setExports] = useState<ExportListDto>();
  const [errorKey, setErrorKey] = useState<string>();

  async function load() {
    try {
      setExports(await apiRequest<ExportListDto>("/exports"));
      setErrorKey(undefined);
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.messageKey : "errors.unknown",
      );
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  async function cancel(exportId: string) {
    await apiRequest<void>(`/exports/${exportId}`, { method: "DELETE" });
    await load();
  }

  return (
    <section className="page-card exports-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t("exports.eyebrow")}</p>
          <h1>{t("exports.title")}</h1>
        </div>
      </div>
      <p>{t("exports.lead")}</p>
      {errorKey ? (
        <p role="alert" className="form-error">
          {t(errorKey)}
        </p>
      ) : null}
      {!exports ? (
        <p>{t("loading")}</p>
      ) : exports.items.length === 0 ? (
        <p className="empty-state">{t("exports.empty")}</p>
      ) : (
        <div className="project-grid">
          {exports.items.map((item) => (
            <article className="project-card" key={item.id}>
              <h2>{item.name}</h2>
              <p>
                {item.width} × {item.height} / {item.fps} fps
              </p>
              <p>
                {t(`jobs.${item.status}`)} ({item.progress}%)
              </p>
              {item.status === "failed" ? (
                <p role="alert" className="form-error">
                  {t("errors.exportFailed")}
                </p>
              ) : null}
              <div className="card-actions">
                {item.status === "succeeded" ? (
                  <a className="button-link" href={exportContentUrl(item.id)}>
                    {t("exports.download")}
                  </a>
                ) : null}
                {item.status === "queued" || item.status === "running" ? (
                  <button type="button" onClick={() => void cancel(item.id)}>
                    {t("exports.cancel")}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
