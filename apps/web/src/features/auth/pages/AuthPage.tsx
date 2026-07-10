import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { changeLocale } from "../../../i18n";
import { ApiError, apiRequest, type UserDto } from "../../../shared/lib/api";

interface AuthPageProps {
  mode: "login" | "register";
  onAuthenticated: (user: UserDto) => void;
}

export function AuthPage({ mode, onAuthenticated }: AuthPageProps) {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errorKey, setErrorKey] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrorKey(undefined);
    try {
      const user = await apiRequest<UserDto>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(
          mode === "register"
            ? {
                email,
                password,
                password_confirmation: confirmation,
                locale: i18n.language.startsWith("en") ? "en" : "ja",
              }
            : { email, password },
        ),
      });
      await changeLocale(user.preferred_locale);
      onAuthenticated(user);
    } catch (error) {
      setErrorKey(
        error instanceof ApiError ? error.messageKey : "errors.unknown",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const isRegister = mode === "register";
  return (
    <main className="auth-layout">
      <section className="auth-card">
        <div className="auth-card__header">
          <p className="eyebrow">{t("appName")}</p>
          <select
            aria-label={t("language")}
            value={i18n.language.startsWith("en") ? "en" : "ja"}
            onChange={(event) =>
              void changeLocale(event.target.value === "en" ? "en" : "ja")
            }
          >
            <option value="ja">{t("japanese")}</option>
            <option value="en">{t("english")}</option>
          </select>
        </div>
        <h1>{t(isRegister ? "auth.registerTitle" : "auth.loginTitle")}</h1>
        <p>{t(isRegister ? "auth.registerLead" : "auth.loginLead")}</p>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            <span>{t("auth.email")}</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            <span>{t("auth.password")}</span>
            <input
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              minLength={isRegister ? 12 : 1}
              maxLength={128}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {isRegister ? (
            <label>
              <span>{t("auth.passwordConfirmation")}</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
          ) : null}
          {errorKey ? (
            <p role="alert" className="form-error">
              {t(errorKey)}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={submitting || (isRegister && password !== confirmation)}
          >
            {t(
              submitting
                ? "auth.submitting"
                : isRegister
                  ? "auth.register"
                  : "auth.login",
            )}
          </button>
        </form>
        <p>
          {t(isRegister ? "auth.haveAccount" : "auth.needAccount")}{" "}
          <Link to={isRegister ? "/login" : "/register"}>
            {t(isRegister ? "auth.login" : "auth.register")}
          </Link>
        </p>
      </section>
    </main>
  );
}
