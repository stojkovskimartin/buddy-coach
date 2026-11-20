import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { BrandMark } from "../lib/icons";
import { errorMessage, useSession } from "../lib/session";

type Mode = "login" | "register";

const MIN_PASSWORD = 10;

export function LoginPage() {
  const { login, register } = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const registering = mode === "register";

  function choose(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (registering) await register(email, password);
      else await login(email, password);
      navigate("/");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <aside className="auth-brand" aria-hidden="true">
        <BrandMark />
        <p className="auth-brand-name">Buddy Coach</p>
        <p className="auth-tagline">Your coach for nutrition, training and recovery.</p>
      </aside>
      <section className="auth-panel card">
        <h1>{registering ? "Create your account" : "Welcome back"}</h1>
        <p className="muted">
          {registering
            ? "Free, and your data stays yours."
            : "Log in to see today's plan and how you are doing."}
        </p>
        <div className="segmented auth-switch" role="group" aria-label="Account">
          <button type="button" aria-pressed={!registering} onClick={() => choose("login")}>
            I have an account
          </button>
          <button type="button" aria-pressed={registering} onClick={() => choose("register")}>
            Create an account
          </button>
        </div>
        <form onSubmit={submit} aria-label={registering ? "Create account" : "Log in"}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <div className="password-field">
            <label>
              Password
              <input
                type={showPassword ? "text" : "password"}
                autoComplete={registering ? "new-password" : "current-password"}
                minLength={registering ? MIN_PASSWORD : 1}
                required
                aria-describedby={registering ? "password-hint" : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="ghost reveal"
              aria-pressed={showPassword}
              onClick={() => setShowPassword((shown) => !shown)}
            >
              Show password
            </button>
          </div>
          {registering && (
            <p id="password-hint" className="muted small">
              At least {MIN_PASSWORD} characters.
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className="block">
            {busy ? "One moment…" : registering ? "Create account" : "Log in"}
          </button>
        </form>
      </section>
    </main>
  );
}
