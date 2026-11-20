import type { Profile } from "@buddy/api-client";
import { useEffect, useState, type ReactNode } from "react";
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes } from "react-router-dom";

import {
  BrandMark,
  CoachIcon,
  ConnectIcon,
  FoodIcon,
  HomeIcon,
  LogoutIcon,
  MoonIcon,
  ProfileIcon,
  ProgressIcon,
  SunIcon,
  SystemIcon,
} from "./lib/icons";
import { I18nProvider, useI18n, type Locale } from "./i18n";
import { LanguageSwitcher } from "./i18n/LanguageSwitcher";
import { errorMessage, SessionProvider, useSession, type CoachApi } from "./lib/session";
import { useTheme, type Theme } from "./lib/theme";
import { CoachPage } from "./pages/CoachPage";
import { ConnectionCallback, ConnectionsPage } from "./pages/ConnectionsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { FoodPage } from "./pages/FoodPage";
import { LoginPage } from "./pages/LoginPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { PhotoStrip } from "./pages/Photos";
import { ProgressPage } from "./pages/ProgressPage";

/** Logged-in users without a profile go to onboarding first. */
function RequireProfile({ children }: { children: ReactNode }) {
  const { api, loggedIn } = useSession();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loggedIn) return;
    let active = true;
    api.getProfile().then(
      (p) => active && setProfile(p),
      (e: unknown) => active && setError(errorMessage(e)),
    );
    return () => {
      active = false;
    };
  }, [api, loggedIn]);

  if (!loggedIn) return <Navigate to="/login" replace />;
  if (error)
    return (
      <p role="alert" className="error">
        {error}
      </p>
    );
  if (profile === undefined) return <Loading />;
  if (profile === null) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

/** A busy indicator (an indeterminate progress bar to assistive technology). */
function Loading() {
  const { t } = useI18n();
  return (
    <div role="progressbar" aria-label={t.loading.replace("…", "")} className="loading">
      <span className="skeleton" />
      <span className="skeleton short" />
    </div>
  );
}

const SECTIONS = [
  { to: "/", key: "dashboard", icon: <HomeIcon /> },
  { to: "/food", key: "food", icon: <FoodIcon /> },
  { to: "/progress", key: "progress", icon: <ProgressIcon /> },
  { to: "/coach", key: "coach", icon: <CoachIcon /> },
  { to: "/connections", key: "connections", icon: <ConnectIcon /> },
  { to: "/onboarding", key: "profile", icon: <ProfileIcon /> },
] as const;

const THEMES: { value: Theme; icon: ReactNode }[] = [
  { value: "light", icon: <SunIcon /> },
  { value: "dark", icon: <MoonIcon /> },
  { value: "system", icon: <SystemIcon /> },
];

function ThemeSwitcher() {
  const [theme, setTheme] = useTheme();
  const { t } = useI18n();
  return (
    <fieldset className="theme-switcher">
      <legend className="visually-hidden">{t.shell.theme}</legend>
      {THEMES.map((option) => (
        <label
          key={option.value}
          title={t.shell.themes[option.value]}
          className={theme === option.value ? "selected" : ""}
        >
          <input
            type="radio"
            name="theme"
            value={option.value}
            checked={theme === option.value}
            onChange={() => setTheme(option.value)}
          />
          {option.icon}
          <span className="visually-hidden">{t.shell.themes[option.value]}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** One navigation: a sidebar on wide screens, a top bar with a scrolling strip on phones. */
function Sidebar() {
  const { logout } = useSession();
  const { t } = useI18n();
  return (
    <header className="sidebar">
      <Link to="/" className="brand" aria-label={t.shell.brandHome}>
        <BrandMark />
        <span>Buddy Coach</span>
      </Link>
      <nav aria-label={t.shell.mainNav} className="nav">
        {SECTIONS.map((section) => (
          <NavLink key={section.to} to={section.to} end={section.to === "/"} className="nav-link">
            {section.icon}
            <span>{t.shell.nav[section.key]}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="switchers">
          <LanguageSwitcher />
          <ThemeSwitcher />
        </div>
        <button type="button" className="ghost nav-link" onClick={() => void logout()}>
          <LogoutIcon />
          <span>{t.shell.logout}</span>
        </button>
      </div>
    </header>
  );
}

function ProfileEditor() {
  const { api, loggedIn } = useSession();
  const { t } = useI18n();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!loggedIn) return;
    let active = true;
    api.getProfile().then(
      (p) => active && setProfile(p),
      // Never fall back to an empty form: saving it would overwrite the real profile.
      (e: unknown) => active && setError(errorMessage(e)),
    );
    return () => {
      active = false;
    };
  }, [api, loggedIn]);
  if (!loggedIn) return <Navigate to="/login" replace />;
  if (error)
    return (
      <p role="alert" className="error">
        {error}
      </p>
    );
  if (profile === undefined) return <Loading />;
  return (
    <OnboardingPage initial={profile}>
      {profile && (
        <section className="card" aria-labelledby="avatar-title">
          <h2 id="avatar-title">{t.shell.profilePicture}</h2>
          <PhotoStrip kind="avatar" title={t.shell.profilePicture} />
        </section>
      )}
    </OnboardingPage>
  );
}

export function AppRoutes() {
  const { loggedIn } = useSession();
  const { t } = useI18n();
  return (
    <div className={loggedIn ? "shell" : "shell guest"}>
      <a href="#content" className="skip-link">
        {t.shell.skip}
      </a>
      {loggedIn && <Sidebar />}
      <div id="content" className="content" tabIndex={-1}>
        <Routes>
          <Route path="/login" element={loggedIn ? <Navigate to="/" replace /> : <LoginPage />} />
          <Route path="/onboarding" element={<ProfileEditor />} />
          <Route
            path="/"
            element={
              <RequireProfile>
                <DashboardPage />
              </RequireProfile>
            }
          />
          <Route
            path="/coach"
            element={
              <RequireProfile>
                <CoachPage />
              </RequireProfile>
            }
          />
          <Route
            path="/food"
            element={
              <RequireProfile>
                <FoodPage />
              </RequireProfile>
            }
          />
          <Route
            path="/progress"
            element={
              <RequireProfile>
                <ProgressPage />
              </RequireProfile>
            }
          />
          <Route
            path="/connections"
            element={
              <RequireProfile>
                <ConnectionsPage />
              </RequireProfile>
            }
          />
          <Route
            path="/connections/callback"
            element={
              <RequireProfile>
                <ConnectionCallback />
              </RequireProfile>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export function App({
  api,
  initiallyLoggedIn,
  locale,
}: {
  api?: CoachApi;
  initiallyLoggedIn?: boolean;
  /** Fixed language (tests); otherwise saved choice, browser language, English. */
  locale?: Locale;
}) {
  return (
    <I18nProvider {...(locale ? { locale } : {})}>
      <SessionProvider {...(api ? { api } : {})} {...(initiallyLoggedIn !== undefined ? { initiallyLoggedIn } : {})}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </SessionProvider>
    </I18nProvider>
  );
}
