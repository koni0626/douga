import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { changeLocale } from "../../../i18n";
import {
  ApiError,
  apiRequest,
  type SettingsDto,
} from "../../../shared/lib/api";

export function SettingsPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<SettingsDto>();
  const [errorKey, setErrorKey] = useState<string>();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void apiRequest<SettingsDto>("/settings")
      .then(setSettings)
      .catch((error: unknown) =>
        setErrorKey(
          error instanceof ApiError ? error.messageKey : "errors.unknown",
        ),
      );
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setSaved(false);
    try {
      const updated = await apiRequest<SettingsDto>("/settings", {
        method: "PATCH",
        body: JSON.stringify(settings),
      });
      setSettings(updated);
      await changeLocale(updated.preferred_locale);
      setSaved(true);
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.messageKey : "errors.unknown",
      );
    }
  }

  if (!settings) return <p>{errorKey ? t(errorKey) : t("loading")}</p>;
  return (
    <section className="page-card">
      <h1>{t("settings.title")}</h1>
      <form className="settings-form" onSubmit={(event) => void submit(event)}>
        <label>
          <span>{t("settings.uiLocale")}</span>
          <select
            value={settings.preferred_locale}
            onChange={(event) =>
              setSettings({
                ...settings,
                preferred_locale: event.target.value as "ja" | "en",
              })
            }
          >
            <option value="ja">{t("japanese")}</option>
            <option value="en">{t("english")}</option>
          </select>
        </label>
        <label>
          <span>{t("settings.contentLocale")}</span>
          <select
            value={settings.default_content_locale}
            onChange={(event) =>
              setSettings({
                ...settings,
                default_content_locale: event.target.value as "ja" | "en",
              })
            }
          >
            <option value="ja">{t("japanese")}</option>
            <option value="en">{t("english")}</option>
          </select>
        </label>
        <div className="field-row">
          <label>
            <span>{t("settings.width")}</span>
            <input
              type="number"
              min={320}
              max={7680}
              value={settings.default_video_width}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  default_video_width: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            <span>{t("settings.height")}</span>
            <input
              type="number"
              min={240}
              max={4320}
              value={settings.default_video_height}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  default_video_height: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            <span>{t("settings.fps")}</span>
            <input
              type="number"
              min={1}
              max={120}
              step="0.001"
              value={settings.default_video_fps}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  default_video_fps: event.target.value,
                })
              }
            />
          </label>
        </div>
        {errorKey ? (
          <p role="alert" className="form-error">
            {t(errorKey)}
          </p>
        ) : null}
        {saved ? <p className="form-success">{t("settings.saved")}</p> : null}
        <button type="submit">{t("save")}</button>
      </form>
    </section>
  );
}
