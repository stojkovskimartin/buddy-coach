import type { NutritionTargets } from "@buddy/api-client";
import { ENERGY_GOAL_TEXT, MACROS, NO_TARGETS_TEXT } from "@buddy/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { errorMessage, useSession } from "../lib/session";

type Load =
  | { state: "loading" }
  | { state: "failed"; error: string }
  | { state: "ready"; targets: NutritionTargets | null };

/** Today's calorie and macro targets, with the reasons behind them. Reloads when the tab is shown again. */
export function TargetsCard() {
  const { api } = useSession();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const request = useRef(0);

  const fetchTargets = useCallback(async () => {
    const id = ++request.current; // only the newest request may update the card
    try {
      const targets = await api.getTodayTargets();
      if (id === request.current) setLoad({ state: "ready", targets });
    } catch (e) {
      // A failed background refresh keeps the numbers on screen.
      if (id === request.current)
        setLoad((current) => (current.state === "ready" ? current : { state: "failed", error: errorMessage(e) }));
    }
  }, [api]);

  useEffect(() => {
    void fetchTargets();
    // A dashboard left open overnight shows the new day's targets when the tab is visible again.
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchTargets();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchTargets]);

  let body;
  if (load.state === "loading") {
    body = <p className="muted">Loading…</p>;
  } else if (load.state === "failed") {
    body = (
      <>
        <p role="alert" className="error">
          {load.error}
        </p>
        <button type="button" onClick={() => void fetchTargets()}>
          Try again
        </button>
      </>
    );
  } else if (!load.targets) {
    body = <p className="muted">{NO_TARGETS_TEXT}</p>;
  } else {
    const t = load.targets;
    body = (
      <>
        <p className="kcal">
          <strong>{t.kcal.toLocaleString("en-US")}</strong> kcal
          <span className="muted"> · {ENERGY_GOAL_TEXT[t.goal]}</span>
        </p>
        <dl className="macros">
          {MACROS.map((m) => (
            <div key={m.key}>
              <dt>{m.label}</dt>
              <dd>{t[m.key]} g</dd>
            </div>
          ))}
        </dl>
        {t.reasons.length > 0 && (
          <ul className="muted small">
            {t.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <section className="card" aria-labelledby="targets-title">
      <h2 id="targets-title">Today's food targets</h2>
      {body}
    </section>
  );
}
