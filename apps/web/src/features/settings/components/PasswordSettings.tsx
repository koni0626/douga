import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiError, apiRequest } from "../../../shared/lib/api";

export function PasswordSettings() {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saved, setSaved] = useState(false);
  const [errorKey, setErrorKey] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    setErrorKey(undefined);
    if (newPassword !== confirmation) {
      setErrorKey("settings.password.mismatch");
      return;
    }
    try {
      await apiRequest<void>("/auth/password", {
        method: "PATCH",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          new_password_confirmation: confirmation,
        }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      setSaved(true);
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.messageKey : "errors.unknown",
      );
    }
  }

  return (
    <section className="api-token-settings" aria-labelledby="password-title">
      <div>
        <h2 id="password-title">{t("settings.password.title")}</h2>
        <p>{t("settings.password.description")}</p>
      </div>
      <form className="token-form" onSubmit={(event) => void submit(event)}>
        <label>
          <span>{t("settings.password.current")}</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>
        <label>
          <span>{t("settings.password.new")}</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </label>
        <label>
          <span>{t("settings.password.confirmation")}</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        {errorKey ? <p className="form-error">{t(errorKey)}</p> : null}
        {saved ? (
          <p className="form-success">{t("settings.password.saved")}</p>
        ) : null}
        <button type="submit">{t("settings.password.change")}</button>
      </form>
    </section>
  );
}
