import type {
  IntegrationProvider,
  ProviderStatus,
  WeightSourceSummary,
  WorkoutSourceSummary,
} from "@buddy/api-client";
import { WEIGHT_SOURCE_LABEL, importText, weightSyncText } from "@buddy/shared";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { errorMessage, useSession } from "../lib/session";

/** The provider being connected, kept for the callback page (the provider does not send it). */
const PENDING_PROVIDER = "buddy.connecting";

const PROVIDER: Record<IntegrationProvider, { name: string; what: string }> = {
  withings: { name: "Withings", what: "weight from Withings smart scales" },
};

const MAX_FIT_BYTES = 10 * 1024 * 1024;

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

/** Where the data comes from: the phone's health app (watches and smart scales), watch files,
 * typed-in entries, and what is coming next. */
export function ConnectionsPage() {
  const { api } = useSession();
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
      return setError("Choose a .fit file exported from your watch.");
    if (file.size > MAX_FIT_BYTES) return setError("A FIT file can be at most 10 MB.");
    setBusy(true);
    setError(null);
    try {
      setMessage(`${importText(await api.uploadFit(file))}.`);
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
      if (action === "sync") setMessage(`${weightSyncText(await api.syncIntegration(provider))}.`);
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
      <strong>{WEIGHT_SOURCE_LABEL[source]}</strong>
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
        <h1>Connections</h1>
        <p className="muted">
          Bring in workouts from your watch and weight from your scale. Everything else is calculated from
          them.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="c-phone">
        <h2 id="c-phone">Phone health app (watches and smart scales)</h2>
        <p>
          Watches, fitness apps and smart scales that write to Apple Health on iPhone or Health Connect on
          Android are included: Apple Watch, Garmin, WHOOP, Withings and many more on iPhone; Samsung, Google
          and Fitbit, Xiaomi, Garmin and many more on Android. Connect it once in the Buddy Coach phone app
          (Today → Watch and scale); it syncs when you open the app.
        </p>
        {workouts && <ul className="entries">{(["apple_health", "health_connect"] as const).map(phone)}</ul>}
      </section>

      <section className="card" aria-labelledby="c-fit">
        <h2 id="c-fit">Watch files (FIT)</h2>
        <p>
          Sports watches save activities as .fit files. On the Garmin Connect website: open the activity → ⚙ →
          Export original (a zip with the .fit file inside); other brands offer an export in their app or
          website. Uploading the same activity again updates it.
        </p>
        {workouts && (
          <p className="muted">
            {status(
              workouts.find((w) => w.source === "fit_file"),
              undefined,
            )}
          </p>
        )}
        <div aria-live="polite">{busy ? <p>Importing…</p> : message && <p>{message}</p>}</div>
        <label className="upload">
          Upload a .fit file
          <input type="file" accept=".fit" disabled={busy} onChange={(e) => void upload(e)} />
        </label>
      </section>

      <section className="card" aria-labelledby="c-manual">
        <h2 id="c-manual">Typed in</h2>
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
        <h2 id="c-accounts">Accounts</h2>
        <p className="muted">
          Connect an account directly, without the phone. If that app already sends the same data to Apple
          Health or Health Connect, use only one of the two, or every weigh-in shows up twice. Garmin, WHOOP,
          Polar and Strava come next.
        </p>
        <ul className="entries">
          {accounts.map((a) => (
            <li key={a.provider}>
              <strong>{PROVIDER[a.provider].name}</strong>
              <span className="muted"> · {PROVIDER[a.provider].what} · </span>
              <span className="muted">{accountStatus(a)}</span>{" "}
              {a.available && !a.connected && (
                <button type="button" disabled={busy} onClick={() => void act(a.provider, "connect")}>
                  Connect {PROVIDER[a.provider].name}
                </button>
              )}
              {a.connected && (
                <>
                  <button type="button" disabled={busy} onClick={() => void act(a.provider, "sync")}>
                    Sync {PROVIDER[a.provider].name} now
                  </button>{" "}
                  <button type="button" className="link" disabled={busy} onClick={() => void act(a.provider, "disconnect")}>
                    Disconnect {PROVIDER[a.provider].name}
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

function accountStatus(a: ProviderStatus): string {
  if (a.connected) return a.last_sync_at ? `Connected, last sync ${when(a.last_sync_at)}` : "Connected";
  return a.available ? "Not connected" : "Not set up on this server yet";
}

/** Where the provider sends the browser back to: finishes connecting and shows the result. */
export function ConnectionCallback() {
  const { api } = useSession();
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
      setResult({ ok: false, text: "The account was not connected. Try again from Connections." });
      return;
    }
    const name = PROVIDER[provider].name;
    api.finishIntegration(provider, code, state).then(
      (r) =>
        setResult(
          r.synced
            ? { ok: true, text: `${name} is connected: ${weightSyncText(r)}.` }
            : { ok: true, text: `${name} is connected. Bringing in the data failed; use Sync now in Connections.` },
        ),
      (e: unknown) => setResult({ ok: false, text: errorMessage(e) }),
    );
  }, [api, location, navigate]);

  return (
    <main className="stack">
      <section className="card">
        <h1>Connecting your account</h1>
        {!result && <p>Bringing in your data…</p>}
        {result && (
          <p role={result.ok ? "status" : "alert"} className={result.ok ? undefined : "error"}>
            {result.text}
          </p>
        )}
        <Link to="/connections">Back to Connections</Link>
      </section>
    </main>
  );
}

function status(
  workouts: WorkoutSourceSummary | undefined,
  weights: WeightSourceSummary | undefined,
): string {
  const parts: string[] = [];
  if (workouts)
    parts.push(
      `${workouts.workouts} ${workouts.workouts === 1 ? "workout" : "workouts"}, latest ${when(workouts.last_at)}`,
    );
  if (weights)
    parts.push(
      `${weights.weights} ${weights.weights === 1 ? "weight" : "weights"}, latest ${when(weights.last_at)}`,
    );
  return parts.length ? parts.join(" · ") : "Nothing yet";
}
