import type { Profile } from "@buddy/api-client";
import { useEffect, useState, type ReactNode } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";

import { errorMessage, SessionProvider, useSession, type CoachApi } from "./lib/session";
import { CoachPage } from "./pages/CoachPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { OnboardingPage } from "./pages/OnboardingPage";

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
  if (profile === undefined) return <p className="muted">Loading…</p>;
  if (profile === null) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function Header() {
  const { loggedIn, logout } = useSession();
  return (
    <header className="topbar">
      <Link to="/" className="brand">
        Buddy Coach
      </Link>
      {loggedIn && (
        <nav>
          <Link to="/">Goals</Link>
          <Link to="/coach">Coach</Link>
          <Link to="/onboarding">Profile</Link>
          <button type="button" className="link" onClick={() => void logout()}>
            Log out
          </button>
        </nav>
      )}
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
  if (profile === undefined) return <p className="muted">Loading…</p>;
  return <OnboardingPage initial={profile} />;
}

export function AppRoutes() {
  const { loggedIn } = useSession();
  return (
    <>
      <Header />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
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
