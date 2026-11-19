import type { WeightHistory } from "@buddy/api-client";
import {
  WEIGHT_EMPTY_TEXT,
  WEIGHT_INPUT_ERROR,
  WEIGHT_SOURCE_LABEL,
  parseWeightKg,
  scaleSeries,
  trendChangeText,
} from "@buddy/shared";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { errorMessage, useSession } from "../lib/session";

const CHART = { width: 560, height: 140 };
const RECENT = 5;

type Load = { state: "loading" } | { state: "failed"; error: string } | { state: "ready"; history: WeightHistory };

/** Latest weight, its 90-day trend, quick entry and the last few measurements. */
export function WeightCard() {
  const { api } = useSession();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const fetchHistory = useCallback(async () => {
    const id = ++request.current; // only the newest request may update the card
    try {
      const history = await api.listWeights();
      if (id === request.current) setLoad({ state: "ready", history });
    } catch (e) {
      if (id === request.current)
        setLoad((current) => (current.state === "ready" ? current : { state: "failed", error: errorMessage(e) }));
    }
  }, [api]);

  useEffect(() => {
    void fetchHistory();
    // Reload when the tab is visible again (e.g. after a weight was logged on the phone).
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchHistory();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchHistory]);

  async function change(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await fetchHistory();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const weight_kg = parseWeightKg(text);
    if (weight_kg === null) {
      setError(WEIGHT_INPUT_ERROR);
      return;
    }
    if (await change(() => api.logWeight({ weight_kg }))) setText("");
  }

  let body;
  if (load.state === "loading") {
    body = <p className="muted">Loading…</p>;
  } else if (load.state === "failed") {
    body = (
      <>
        <p role="alert" className="error">
          {load.error}
        </p>
        <button type="button" onClick={() => void fetchHistory()}>
          Try again
        </button>
      </>
    );
  } else {
    const { weights, trend } = load.history;
    const latest = weights[0];
    const scaled = scaleSeries(
      trend.map((t) => ({ day: t.day, value: t.weight_kg })),
      CHART.width,
      CHART.height,
    );
    const changeText = trendChangeText(trend);
    body = latest ? (
      <>
        <p className="kcal">
          <strong>{latest.weight_kg.toFixed(1)}</strong> kg
          <span className="muted"> · {changeText ?? `measured ${latest.day}`}</span>
        </p>
        {scaled.points.length > 1 && (
          <svg
            className="chart"
            viewBox={`0 0 ${CHART.width} ${CHART.height}`}
            role="img"
            aria-label={`Weight trend (7-day average) from ${scaled.points[0]!.value.toFixed(1)} to ${scaled.points[scaled.points.length - 1]!.value.toFixed(1)} kg`}
          >
            <path d={scaled.path} />
            {scaled.points.map((p) => (
              <circle key={p.day} cx={p.x} cy={p.y} r={3} />
            ))}
          </svg>
        )}
        <ul className="entries">
          {weights.slice(0, RECENT).map((w) => (
            <li key={w.id}>
              <span>
                {w.weight_kg.toFixed(1)} kg <span className="muted">· {w.day} · {WEIGHT_SOURCE_LABEL[w.source]}</span>
              </span>
              <button
                type="button"
                className="link"
                disabled={busy}
                aria-label={`Delete ${w.weight_kg.toFixed(1)} kg from ${w.day}`}
                onClick={() => void change(() => api.deleteWeight(w.id))}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </>
    ) : (
      <p className="muted">{WEIGHT_EMPTY_TEXT}</p>
    );
  }

  return (
    <section className="card" aria-labelledby="weight-title">
      <h2 id="weight-title">Weight</h2>
      {body}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <form className="inline" onSubmit={submit} aria-label="Log your weight">
        <label>
          Weight now (kg)
          <input inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <button type="submit" disabled={busy || !text.trim()}>
          Save weight
        </button>
      </form>
    </section>
  );
}
