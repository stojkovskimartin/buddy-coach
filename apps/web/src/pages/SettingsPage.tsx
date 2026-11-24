import { localToday } from "@buddy/shared";
import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";

import { useI18n } from "../i18n";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher";
import { errorMessage, useSession } from "../lib/session";
import { ThemeSwitcher } from "../lib/ThemeSwitcher";

/** Saves a downloaded file under its name (the browser asks where, or uses Downloads). */
function saveFile(file: Blob, name: string): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0); // after the browser has started the download
}

/** Language, theme, a copy of all data, and deleting the account. Reachable before onboarding,
 * so an account without a profile can still be deleted. */
export function SettingsPage() {
  const { loggedIn } = useSession();
  const { t } = useI18n();

  if (!loggedIn) return <Navigate to="/login" replace />;

  return (
    <main className="stack">
      <header className="page-header">
        <h1>{t.settings.title}</h1>
      </header>

      <section className="card" aria-labelledby="s-look">
        <h2 id="s-look">{t.settings.lookTitle}</h2>
        <div className="actions">
          <span>{t.shell.language}</span>
          <LanguageSwitcher />
        </div>
        <div className="actions">
          <span>{t.shell.theme}</span>
          <ThemeSwitcher />
        </div>
      </section>

      <ExportCard />
      <DeleteCard />
    </main>
  );
}

function ExportCard() {
  const { api } = useSession();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      saveFile(await api.exportData(), `buddy-coach-export-${localToday()}.json`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="s-export">
      <h2 id="s-export">{t.settings.exportTitle}</h2>
      <p className="muted">{t.settings.exportText}</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button type="button" className="secondary" disabled={busy} onClick={() => void download()}>
        {busy ? t.settings.exporting : t.settings.exportButton}
      </button>
    </section>
  );
}

function DeleteCard() {
  const { deleteAccount } = useSession();
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(password); // on success the login page takes over
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="s-delete">
      <h2 id="s-delete">{t.settings.deleteTitle}</h2>
      <p>{t.settings.deleteText}</p>
      <ul>
        {t.settings.deleteItems.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="muted">{t.settings.deleteHint}</p>
      <form onSubmit={submit} aria-label={t.settings.deleteTitle}>
        <label>
          {t.login.password}
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          {t.settings.deleteConfirm}
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="submit" className="danger" disabled={busy || !confirmed || !password}>
            {busy ? t.settings.deleting : t.settings.deleteButton}
          </button>
        </div>
      </form>
    </section>
  );
}
