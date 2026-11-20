import type {
  IntegrationProvider,
  ProviderStatus,
  WeightSourceSummary,
  WorkoutSourceSummary,
} from "@buddy/api-client";
import { INTL_LOCALE, type Locale } from "@buddy/shared";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useI18n } from "../i18n";
import type { Messages } from "../i18n/messages";
import { errorMessage, useSession } from "../lib/session";

/** The provider being connected, kept for the callback page (the provider does not send it). */
const PENDING_PROVIDER = "buddy.connecting";

const PROVIDER: Record<IntegrationProvider, { name: string; data: "weight" | "workout" }> = {
  withings: { name: "Withings", data: "weight" },
  whoop: { name: "WHOOP", data: "workout" },
};

const MAX_FIT_BYTES = 10 * 1024 * 1024;

function when(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleString(INTL_LOCALE[locale], { dateStyle: "medium", timeStyle: "short" });
}

/** Where the data comes from: the phone's health app (watches and smart scales), watch files,
 * typed-in entries, and what is coming next. */
export function ConnectionsPage() {
  const { api } = useSession();
  const { t, s, locale } = useI18n();
  const status = (w: WorkoutSourceSummary | undefined, m: WeightSourceSummary | undefined) =>
    sourceStatus(w, m, t, locale);
  const [workouts, setWorkouts] = useState<WorkoutSourceSummary[] | null>(null);
  const [accounts, setAccounts] = useState<ProviderStatus[]>([]);
  const [weights, setWeights] = useState<WeightSourceSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, s, a] = await Promise.all([api.workoutSources(), api.weightSources(), api.integrations()]);
      setWorkouts(w);
      setWeights(s);
      setAccounts(a);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setMessage(null);
    if (!file.name.toLowerCase().endsWith(".fit"))
      return setError(t.connections.notFit);
    if (file.size > MAX_FIT_BYTES) return setError(t.connections.fitTooBig);
    setBusy(true);
    setError(null);
    try {
      setMessage(`${s.importText(await api.uploadFit(file))}.`);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function act(provider: IntegrationProvider, action: "connect" | "sync" | "disconnect") {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (action === "connect") {
        sessionStorage.setItem(PENDING_PROVIDER, provider);
        window.location.assign(await api.connectIntegration(provider));
        return;
      }
      if (action === "sync")
        setMessage(`${s.syncText(await api.syncIntegration(provider), PROVIDER[provider].data)}.`);
      else await api.disconnectIntegration(provider);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const phone = (source: "apple_health" | "health_connect") => (
    <li key={source}>
      <strong>{s.weightSourceLabel[source]}</strong>
      <span className="muted">
        {" "}
        ·{" "}
        {status(
          workouts?.find((w) => w.source === source),
          weights.find((w) => w.source === source),
        )}
      </span>
    </li>
  );

  return (
    <main className="stack">
      <section className="card">
        <h1>{t.connections.title}</h1>
        <p className="muted">{t.connections.intro}</p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="c-phone">
        <h2 id="c-phone">{t.connections.phoneTitle}</h2>
        <p>{t.connections.phoneText}</p>
        {workouts && <ul className="entries">{(["apple_health", "health_connect"] as const).map(phone)}</ul>}
      </section>

      <section className="card" aria-labelledby="c-fit">
        <h2 id="c-fit">{t.connections.fitTitle}</h2>
        <p>{t.connections.fitText}</p>
        {workouts && (
          <p className="muted">
            {status(
              workouts.find((w) => w.source === "fit_file"),
              undefined,
            )}
          </p>
        )}
        <div aria-live="polite">{busy ? <p>{t.connections.importing}</p> : message && <p>{message}</p>}</div>
        <label className="upload">
          {t.connections.upload}
          <input type="file" accept=".fit" disabled={busy} onChange={(e) => void upload(e)} />
        </label>
      </section>

      <section className="card" aria-labelledby="c-manual">
        <h2 id="c-manual">{t.connections.manualTitle}</h2>
        <p className="muted">
          {workouts
            ? status(
                workouts.find((w) => w.source === "manual"),
                weights.find((w) => w.source === "manual"),
              )
            : ""}
        </p>
      </section>

      <section className="card" aria-labelledby="c-accounts">
        <h2 id="c-accounts">{t.connections.accountsTitle}</h2>
        <p className="muted">{t.connections.accountsText}</p>
        <ul className="entries">
          {accounts.map((a) => (
            <li key={a.provider}>
              <strong>{PROVIDER[a.provider].name}</strong>
              <span className="muted"> · {t.connections.what[a.provider]} · </span>
              <span className="muted">{accountStatus(a, t, locale)}</span>{" "}
              {a.available && !a.connected && (
                <button type="button" disabled={busy} onClick={() => void act(a.provider, "connect")}>
                  {t.connections.connect(PROVIDER[a.provider].name)}
                </button>
              )}
              {a.connected && (
                <>
                  <button type="button" disabled={busy} onClick={() => void act(a.provider, "sync")}>
                    {t.connections.sync(PROVIDER[a.provider].name)}
                  </button>{" "}
                  <button type="button" className="link" disabled={busy} onClick={() => void act(a.provider, "disconnect")}>
                    {t.connections.disconnect(PROVIDER[a.provider].name)}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function accountStatus(a: ProviderStatus, t: Messages, locale: Locale): string {
  if (a.connected)
    return a.last_sync_at
      ? t.connections.connectedSynced(when(a.last_sync_at, locale))
      : t.connections.connected;
  return a.available ? t.connections.notConnected : t.connections.notSetUp;
}

/** Where the provider sends the browser back to: finishes connecting and shows the result. */
export function ConnectionCallback() {
  const { api } = useSession();
  const { t, s } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // the code works once; React may run effects twice in development
    started.current = true;
    const query = new URLSearchParams(location.search);
    void navigate(location.pathname, { replace: true }); // keep the code out of the history
    const provider = sessionStorage.getItem(PENDING_PROVIDER) as IntegrationProvider | null;
    sessionStorage.removeItem(PENDING_PROVIDER);
    const code = query.get("code");
    const state = query.get("state");
    if (!provider || !(provider in PROVIDER) || !code || !state) {
      setResult({ ok: false, text: t.connections.callbackFailed });
      return;
    }
    const name = PROVIDER[provider].name;
    api.finishIntegration(provider, code, state).then(
      (r) =>
        setResult(
          r.synced
            ? { ok: true, text: t.connections.callbackDone(name, s.syncText(r, PROVIDER[provider].data)) }
            : { ok: true, text: t.connections.callbackSyncFailed(name) },
        ),
      (e: unknown) => setResult({ ok: false, text: errorMessage(e) }),
    );
    // The code works once (the `started` guard), so a language change never runs it again.
  }, [api, location, navigate, t, s]);

  return (
    <main className="stack">
      <section className="card">
        <h1>{t.connections.callbackTitle}</h1>
        {!result && <p>{t.connections.callbackBusy}</p>}
        {result && (
          <p role={result.ok ? "status" : "alert"} className={result.ok ? undefined : "error"}>
            {result.text}
          </p>
        )}
        <Link to="/connections">{t.connections.back}</Link>
      </section>
    </main>
  );
}

function sourceStatus(
  workouts: WorkoutSourceSummary | undefined,
  weights: WeightSourceSummary | undefined,
  t: Messages,
  locale: Locale,
): string {
  const parts: string[] = [];
  if (workouts) parts.push(t.connections.workouts(workouts.workouts, when(workouts.last_at, locale)));
  if (weights) parts.push(t.connections.weights(weights.weights, when(weights.last_at, locale)));
  return parts.length ? parts.join(" · ") : t.connections.nothingYet;
}
