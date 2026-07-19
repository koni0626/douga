import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface ProjectSettingsDialogProps {
  fps: number;
  onApply: (fps: number) => void;
  onClose: () => void;
}

export function ProjectSettingsDialog({
  fps,
  onApply,
  onClose,
}: ProjectSettingsDialogProps) {
  const { t } = useTranslation();
  const [nextFps, setNextFps] = useState(fps);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!Number.isInteger(nextFps) || nextFps < 1 || nextFps > 60) return;
    onApply(nextFps);
  }

  return (
    <div
      className="project-create-dialog-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="project-settings-dialog-title"
        aria-modal="true"
        className="project-create-dialog project-settings-dialog"
        role="dialog"
      >
        <h2 id="project-settings-dialog-title">
          {t("projects.settings.title")}
        </h2>
        <form onSubmit={submit}>
          <label htmlFor="project-fps">
            <span>{t("projects.settings.fps")}</span>
            <input
              autoFocus
              id="project-fps"
              list="project-fps-presets"
              max={60}
              min={1}
              step={1}
              type="number"
              value={nextFps}
              onChange={(event) => setNextFps(Number(event.target.value))}
            />
            <small>{t("projects.settings.fpsHint")}</small>
          </label>
          <datalist id="project-fps-presets">
            {[10, 15, 24, 30, 60].map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          <footer className="project-create-dialog-actions">
            <button type="button" onClick={onClose}>
              {t("projects.cancel")}
            </button>
            <button className="primary" type="submit">
              {t("projects.settings.apply")}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
