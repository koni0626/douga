import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ProjectDetailDto } from "../../../shared/lib/api";

export interface ProjectExportOptions {
  filename: string;
  width: number;
  height: number;
  fps: number;
}

interface ProjectExportDialogProps {
  busy: boolean;
  detail: ProjectDetailDto;
  errorKey?: string;
  onClose: () => void;
  onExport: (options: ProjectExportOptions) => void;
}

export function ProjectExportDialog({
  busy,
  detail,
  errorKey,
  onClose,
  onExport,
}: ProjectExportDialogProps) {
  const { t } = useTranslation();
  const video = detail.document.video;
  const defaultFilename = detail.project.name.toLowerCase().endsWith(".mp4")
    ? detail.project.name
    : `${detail.project.name}.mp4`;
  const [filename, setFilename] = useState(defaultFilename);
  const [width, setWidth] = useState(video.width);
  const [height, setHeight] = useState(video.height);
  const [fps, setFps] = useState(video.fps);
  const estimatedFrames = useMemo(() => {
    const durationMs =
      video.duration_ms ?? detail.project.estimated_duration_ms ?? 5_000;
    return Math.ceil((durationMs / 1_000) * fps);
  }, [detail.project.estimated_duration_ms, fps, video.duration_ms]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (
      busy ||
      !filename.trim() ||
      width < 320 ||
      height < 240 ||
      fps < 1 ||
      fps > 60
    )
      return;
    onExport({ filename: filename.trim(), width, height, fps });
  }

  return (
    <div
      className="project-create-dialog-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        aria-labelledby="project-export-dialog-title"
        aria-modal="true"
        className="project-create-dialog project-export-dialog"
        role="dialog"
      >
        <h2 id="project-export-dialog-title">
          {t("projects.exportDialog.title")}
        </h2>
        <form onSubmit={submit}>
          <label htmlFor="export-filename">
            <span>{t("projects.exportDialog.filename")}</span>
            <input
              autoFocus
              id="export-filename"
              maxLength={255}
              required
              type="text"
              value={filename}
              onChange={(event) => setFilename(event.target.value)}
            />
          </label>
          <div className="project-export-resolution">
            <label htmlFor="export-width">
              <span>{t("projects.exportDialog.width")}</span>
              <input
                id="export-width"
                max={7680}
                min={320}
                required
                type="number"
                value={width}
                onChange={(event) => setWidth(Number(event.target.value))}
              />
            </label>
            <span aria-hidden="true">×</span>
            <label htmlFor="export-height">
              <span>{t("projects.exportDialog.height")}</span>
              <input
                id="export-height"
                max={4320}
                min={240}
                required
                type="number"
                value={height}
                onChange={(event) => setHeight(Number(event.target.value))}
              />
            </label>
          </div>
          <label htmlFor="export-fps">
            <span>{t("projects.exportDialog.fps")}</span>
            <input
              id="export-fps"
              list="export-fps-presets"
              max={60}
              min={1}
              required
              step={1}
              type="number"
              value={fps}
              onChange={(event) => setFps(Number(event.target.value))}
            />
          </label>
          <datalist id="export-fps-presets">
            {[10, 15, 24, 30, 60].map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          <p className="project-export-estimate">
            {t("projects.exportDialog.estimatedFrames", {
              count: estimatedFrames,
            })}
          </p>
          <small>{t("projects.exportDialog.overrideHint")}</small>
          {errorKey ? (
            <p className="form-error" role="alert">
              {t(errorKey)}
            </p>
          ) : null}
          <footer className="project-create-dialog-actions">
            <button disabled={busy} type="button" onClick={onClose}>
              {t("projects.cancel")}
            </button>
            <button className="primary" disabled={busy} type="submit">
              {t(
                busy
                  ? "projects.exportDialog.starting"
                  : "projects.exportDialog.start",
              )}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
