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
  return (
    <div role="progressbar" aria-label="Loading" className="loading">
      <span className="skeleton" />
      <span className="skeleton short" />
    </div>
  );
}

const SECTIONS = [
  { to: "/", label: "Goals", icon: <HomeIcon /> },
  { to: "/food", label: "Food", icon: <FoodIcon /> },
  { to: "/progress", label: "Progress", icon: <ProgressIcon /> },
  { to: "/coach", label: "Coach", icon: <CoachIcon /> },
  { to: "/connections", label: "Connections", icon: <ConnectIcon /> },
  { to: "/onboarding", label: "Profile", icon: <ProfileIcon /> },
];

const THEMES: { value: Theme; label: string; icon: ReactNode }[] = [
  { value: "light", label: "Light", icon: <SunIcon /> },
  { value: "dark", label: "Dark", icon: <MoonIcon /> },
  { value: "system", label: "System", icon: <SystemIcon /> },
];

function ThemeSwitcher() {
  const [theme, setTheme] = useTheme();
  return (
    <fieldset className="theme-switcher">
      <legend className="visually-hidden">Theme</legend>
      {THEMES.map((option) => (
        <label key={option.value} title={option.label} className={theme === option.value ? "selected" : ""}>
          <input
            type="radio"
            name="theme"
            value={option.value}
            checked={theme === option.value}
            onChange={() => setTheme(option.value)}
          />
          {option.icon}
          <span className="visually-hidden">{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** One navigation: a sidebar on wide screens, a top bar with a scrolling strip on phones. */
function Sidebar() {
  const { logout } = useSession();
  return (
    <header className="sidebar">
      <Link to="/" className="brand" aria-label="Buddy Coach, home">
        <BrandMark />
        <span>Buddy Coach</span>
      </Link>
      <nav aria-label="Main" className="nav">
        {SECTIONS.map((section) => (
          <NavLink key={section.to} to={section.to} end={section.to === "/"} className="nav-link">
            {section.icon}
            <span>{section.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <ThemeSwitcher />
        <button type="button" className="ghost nav-link" onClick={() => void logout()}>
          <LogoutIcon />
          <span>Log out</span>
        </button>
      </div>
    </header>
  );
}

function ProfileEditor() {
  const { api, loggedIn } = useSession();
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
          <h2 id="avatar-title">Profile picture</h2>
          <PhotoStrip kind="avatar" title="Profile picture" />
        </section>
      )}
    </OnboardingPage>
  );
}

export function AppRoutes() {
  const { loggedIn } = useSession();
  return (
    <div className={loggedIn ? "shell" : "shell guest"}>
      <a href="#content" className="skip-link">
        Skip to content
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

export function App({ api, initiallyLoggedIn }: { api?: CoachApi; initiallyLoggedIn?: boolean }) {
  return (
    <SessionProvider {...(api ? { api } : {})} {...(initiallyLoggedIn !== undefined ? { initiallyLoggedIn } : {})}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </SessionProvider>
  );
}
