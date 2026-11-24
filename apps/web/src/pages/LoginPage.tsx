import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { useI18n } from "../i18n";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher";
import { BrandMark } from "../lib/icons";
import { errorMessage, useSession } from "../lib/session";

type Mode = "login" | "register";

const MIN_PASSWORD = 10;

export function LoginPage() {
  const { login, register, notice } = useSession();
  const { t } = useI18n();
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
        <p className="auth-tagline">{t.login.tagline}</p>
      </aside>
      <section className="auth-panel card">
        <LanguageSwitcher />
        <h1>{registering ? t.login.create : t.login.welcome}</h1>
        <p className="muted">{registering ? t.login.createText : t.login.welcomeText}</p>
        {notice === "accountDeleted" && (
          <p role="status" className="notice">
            {t.login.accountDeleted}
          </p>
        )}
        <div className="segmented auth-switch" role="group" aria-label={t.login.account}>
          <button type="button" aria-pressed={!registering} onClick={() => choose("login")}>
            {t.login.haveAccount}
          </button>
          <button type="button" aria-pressed={registering} onClick={() => choose("register")}>
            {t.login.newAccount}
          </button>
        </div>
        <form onSubmit={submit} aria-label={registering ? t.login.createButton : t.login.logIn}>
          <label>
            {t.login.email}
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
              {t.login.password}
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
              {t.login.showPassword}
            </button>
          </div>
          {registering && (
            <p id="password-hint" className="muted small">
              {t.login.passwordHint(MIN_PASSWORD)}
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className="block">
            {busy ? t.login.busy : registering ? t.login.createButton : t.login.logIn}
          </button>
        </form>
      </section>
    </main>
  );
}
