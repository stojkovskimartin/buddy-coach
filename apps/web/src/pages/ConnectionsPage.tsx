import type { WeightSourceSummary, WorkoutSourceSummary } from "@buddy/api-client";
import { WEIGHT_SOURCE_LABEL, importText } from "@buddy/shared";
import { useCallback, useEffect, useState, type ChangeEvent } from "react";

import { errorMessage, useSession } from "../lib/session";

const MAX_FIT_BYTES = 10 * 1024 * 1024;

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

/** Where the data comes from: the phone's health app (watches and smart scales), watch files,
 * typed-in entries, and what is coming next. */
export function ConnectionsPage() {
  const { api } = useSession();
  const [workouts, setWorkouts] = useState<WorkoutSourceSummary[] | null>(null);
  const [weights, setWeights] = useState<WeightSourceSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, s] = await Promise.all([api.workoutSources(), api.weightSources()]);
      setWorkouts(w);
      setWeights(s);
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

      <section className="card" aria-labelledby="c-next">
        <h2 id="c-next">Direct accounts</h2>
        <p className="muted">
          Connecting a Garmin, WHOOP, Fitbit, Polar or Strava account directly is planned. Until then, the
          phone health app and watch files bring in the same workouts.
        </p>
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
