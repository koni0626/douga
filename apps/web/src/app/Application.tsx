import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";

import { AuthPage } from "../features/auth/pages/AuthPage";
import { AssetLibraryPage } from "../features/assets/pages/AssetLibraryPage";
import { ProjectEditorPage } from "../features/projects/pages/ProjectEditorPage";
import { ProjectListPage } from "../features/projects/pages/ProjectListPage";
import { SettingsPage } from "../features/settings/pages/SettingsPage";
import { ExportListPage } from "../features/exports/pages/ExportListPage";
import { changeLocale } from "../i18n";
import { apiRequest, type UserDto } from "../shared/lib/api";

function HomePage({ user }: { user: UserDto }) {
  const { t } = useTranslation();
  return (
    <section className="page-card hero-card">
      <p className="eyebrow">{t("home.signedInAs", { email: user.email })}</p>
      <h1>{t("home.title")}</h1>
      <p>{t("home.lead")}</p>
    </section>
  );
}

export function Application() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserDto | null>();

  useEffect(() => {
    void apiRequest<UserDto>("/auth/me")
      .then(async (currentUser) => {
        await changeLocale(currentUser.preferred_locale);
        setUser(currentUser);
      })
      .catch(() => setUser(null));
  }, []);

  async function logout() {
    await apiRequest<void>("/auth/logout", { method: "POST" });
    setUser(null);
    navigate("/login");
  }

  if (user === undefined)
    return <main className="loading-screen">{t("loading")}</main>;
  return (
    <div className="site-shell">
      {user ? (
        <header className="site-header">
          <Link className="brand" to="/">
            {t("appName")}
          </Link>
          <nav aria-label={t("navigation")}>
            <Link to="/">{t("home.nav")}</Link>
            <Link to="/projects">{t("projects.nav")}</Link>
            <Link to="/assets">{t("assets.nav")}</Link>
            <Link to="/exports">{t("exports.nav")}</Link>
            <Link to="/settings">{t("settings.nav")}</Link>
            <button
              type="button"
              className="button-link"
              onClick={() => void logout()}
            >
              {t("auth.logout")}
            </button>
          </nav>
        </header>
      ) : null}
      <Routes>
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to="/" replace />
            ) : (
              <AuthPage mode="login" onAuthenticated={setUser} />
            )
          }
        />
        <Route
          path="/register"
          element={
            user ? (
              <Navigate to="/" replace />
            ) : (
              <AuthPage mode="register" onAuthenticated={setUser} />
            )
          }
        />
        <Route
          path="/"
          element={
            user ? <HomePage user={user} /> : <Navigate to="/login" replace />
          }
        />
        <Route
          path="/settings"
          element={user ? <SettingsPage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/projects"
          element={
            user ? <ProjectListPage /> : <Navigate to="/login" replace />
          }
        />
        <Route
          path="/projects/:projectId"
          element={
            user ? <ProjectEditorPage /> : <Navigate to="/login" replace />
          }
        />
        <Route
          path="/assets"
          element={
            user ? <AssetLibraryPage /> : <Navigate to="/login" replace />
          }
        />
        <Route
          path="/exports"
          element={user ? <ExportListPage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="*"
          element={<Navigate to={user ? "/" : "/login"} replace />}
        />
      </Routes>
    </div>
  );
}
