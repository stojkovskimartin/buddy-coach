import type { NutritionTargets } from "@buddy/api-client";
import { INTL_LOCALE, MACROS } from "@buddy/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { useI18n } from "../i18n";
import { errorMessage, useSession } from "../lib/session";

type Load =
  | { state: "loading" }
  | { state: "failed"; error: string }
  | { state: "ready"; targets: NutritionTargets | null };

/** Today's calorie and macro targets, with the reasons behind them. Reloads when the tab is shown again. */
export function TargetsCard() {
  const { api } = useSession();
  const { t, s, locale } = useI18n();
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
    body = <p className="muted">{t.loading}</p>;
  } else if (load.state === "failed") {
    body = (
      <>
        <p role="alert" className="error">
          {load.error}
        </p>
        <button type="button" onClick={() => void fetchTargets()}>
          {t.tryAgain}
        </button>
      </>
    );
  } else if (!load.targets) {
    body = <p className="muted">{s.noTargets}</p>;
  } else {
    const targets = load.targets;
    body = (
      <>
        <p className="kcal">
          <strong>{targets.kcal.toLocaleString(INTL_LOCALE[locale])}</strong> {t.units.kcal}
          <span className="muted"> · {s.energyGoalText[targets.goal]}</span>
        </p>
        <dl className="macros">
          {MACROS.map((m) => (
            <div key={m.key}>
              <dt>{s.macroLabels[m.key]}</dt>
              <dd>
                {targets[m.key]} {t.units.g}
              </dd>
            </div>
          ))}
        </dl>
        {targets.reasons.length > 0 && (
          <ul className="muted small">
            {targets.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <section className="card" aria-labelledby="targets-title">
      <h2 id="targets-title">{t.targets.title}</h2>
      {body}
    </section>
  );
}
