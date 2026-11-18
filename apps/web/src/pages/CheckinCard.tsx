import type { Checkin, CheckinIn } from "@buddy/api-client";
import {
  CHECKIN_QUESTIONS,
  PAIN_LABEL,
  PAIN_NOTE,
  READINESS_NOTE,
  READINESS_TEXT,
  SCALE_VALUES,
  SLEEP_HOURS_ERROR,
  limitingText,
  parseSleepHours,
  scaleOptionLabel,
  type CheckinScale,
} from "@buddy/shared";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { errorMessage, useSession } from "../lib/session";

type Load = { state: "loading" } | { state: "failed"; error: string } | { state: "ready" };

/** Morning check-in: three taps, then today's readiness. Reloads when the tab is shown again. */
export function CheckinCard() {
  const { api } = useSession();
  const [today, setToday] = useState<Checkin | null>(null);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const request = useRef(0);

  const fetchToday = useCallback(async () => {
    const id = ++request.current; // only the newest request may update the card
    try {
      const checkin = await api.getTodayCheckin();
      if (id !== request.current) return;
      setToday(checkin);
      setLoad({ state: "ready" });
    } catch (e) {
      if (id === request.current) setLoad({ state: "failed", error: errorMessage(e) });
    }
  }, [api]);

  useEffect(() => {
    void fetchToday();
    // A dashboard left open overnight shows the new day when the tab is visible again.
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchToday();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchToday]);

  let body;
  if (load.state === "loading") {
    body = <p className="muted">Loading…</p>;
  } else if (load.state === "failed") {
    // Never show an empty form here: saving it would overwrite a check-in we could not load.
    body = (
      <>
        <p role="alert" className="error">
          {load.error}
        </p>
        <button type="button" onClick={() => void fetchToday()}>
          Try again
        </button>
      </>
    );
  } else if (today && !editing) {
    body = <ReadinessView checkin={today} onEdit={() => setEditing(true)} />;
  } else {
    body = (
      <>
        {saveError && (
          <p role="alert" className="error">
            {saveError}
          </p>
        )}
        <CheckinForm
          initial={today}
          onSaving={() => setSaveError(null)}
          onSaved={(saved) => {
            setToday(saved);
            setEditing(false);
          }}
          onError={setSaveError}
        />
      </>
    );
  }

  return (
    <section className="card" aria-labelledby="checkin-title">
      <h2 id="checkin-title">Morning check-in</h2>
      {body}
    </section>
  );
}

function ReadinessView({ checkin, onEdit }: { checkin: Checkin; onEdit: () => void }) {
  const { score, level, limiting_factors } = checkin.readiness;
  const limiting = limitingText(limiting_factors);
  return (
    <div className="readiness">
      <p className={`traffic ${level}`} role="status">
        <strong>Readiness {score}/100</strong> – {READINESS_TEXT[level]}
      </p>
      {limiting && <p className="muted">{limiting}</p>}
      {checkin.pain && <p>{PAIN_NOTE}</p>}
      <p className="muted small">{READINESS_NOTE}</p>
      <button type="button" className="link" onClick={onEdit}>
        Change today's answers
      </button>
    </div>
  );
}

function CheckinForm({
  initial,
  onSaving,
  onSaved,
  onError,
}: {
  initial: Checkin | null;
  onSaving: () => void;
  onSaved: (checkin: Checkin) => void;
  onError: (message: string) => void;
}) {
  const { api } = useSession();
  const [answers, setAnswers] = useState<Partial<Record<CheckinScale, number>>>(() =>
    initial
      ? { sleep_quality: initial.sleep_quality, soreness: initial.soreness, mood: initial.mood }
      : {},
  );
  const [sleepHours, setSleepHours] = useState(initial?.sleep_hours?.toString() ?? "");
  const [pain, setPain] = useState(initial?.pain ?? false);
  const [busy, setBusy] = useState(false);

  const hours = parseSleepHours(sleepHours);
  const complete =
    CHECKIN_QUESTIONS.every((q) => answers[q.key] !== undefined) && hours !== "invalid";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (hours === "invalid" || !complete) return;
    const body: CheckinIn = {
      sleep_quality: answers.sleep_quality!,
      soreness: answers.soreness!,
      mood: answers.mood!,
      pain,
      ...(hours !== null ? { sleep_hours: hours } : {}),
    };
    onSaving();
    setBusy(true);
    try {
      // Editing keeps the day that was loaded; a new check-in lets the server pick today.
      const saved = initial
        ? await api.saveCheckin(initial.day, body)
        : await api.saveTodayCheckin(body);
      onSaved(saved);
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label="Morning check-in">
      {CHECKIN_QUESTIONS.map((q) => (
        <fieldset key={q.key} className="scale">
          <legend>{q.question}</legend>
          <div className="scale-options">
            {SCALE_VALUES.map((value) => (
              <label key={value} className={answers[q.key] === value ? "selected" : ""}>
                <input
                  type="radio"
                  name={q.key}
                  value={value}
                  checked={answers[q.key] === value}
                  onChange={() => setAnswers((a) => ({ ...a, [q.key]: value }))}
                  aria-label={scaleOptionLabel(value, q)}
                />
                <span aria-hidden="true">{value}</span>
              </label>
            ))}
          </div>
          <div className="scale-ends muted small" aria-hidden="true">
            <span>{q.low}</span>
            <span>{q.high}</span>
          </div>
        </fieldset>
      ))}
      <label>
        Hours of sleep (optional)
        <input
          type="text"
          inputMode="decimal"
          value={sleepHours}
          aria-invalid={hours === "invalid"}
          aria-describedby={hours === "invalid" ? "sleep-hours-error" : undefined}
          onChange={(e) => setSleepHours(e.target.value)}
        />
      </label>
      {hours === "invalid" && (
        <p id="sleep-hours-error" className="error">
          {SLEEP_HOURS_ERROR}
        </p>
      )}
      <label className="checkbox">
        <input type="checkbox" checked={pain} onChange={(e) => setPain(e.target.checked)} />
        {PAIN_LABEL}
      </label>
      <button type="submit" disabled={!complete || busy}>
        {busy ? "Saving…" : "Save check-in"}
      </button>
    </form>
  );
}
