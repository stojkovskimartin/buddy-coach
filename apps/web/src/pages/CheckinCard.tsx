import type { Checkin, CheckinIn, Readiness } from "@buddy/api-client";
import { useEffect, useState, type FormEvent } from "react";

import { isoDate } from "../lib/rules";
import { errorMessage, useSession } from "../lib/session";

type Scale = "sleep_quality" | "soreness" | "mood";

/** The three morning questions, 1 (bad) to 5 (great). Same wording as the mobile app. */
export const QUESTIONS: { key: Scale; question: string; low: string; high: string }[] = [
  { key: "sleep_quality", question: "How did you sleep?", low: "Very badly", high: "Great" },
  { key: "soreness", question: "How do your muscles feel?", low: "Very sore", high: "Fresh" },
  { key: "mood", question: "How do you feel?", low: "Very low", high: "Great" },
];

const LEVEL_TEXT: Record<Readiness["level"], string> = {
  green: "Ready to train as planned.",
  amber: "Train, but keep it easy today.",
  red: "Rest or recovery only today.",
};

export const FACTOR_LABELS: Record<string, string> = {
  sleep: "sleep",
  soreness: "sore muscles",
  mood: "mood",
  hrv: "heart rate variability",
  resting_hr: "resting heart rate",
  training_load: "recent training load",
  pain: "pain",
};

/** Morning check-in: three taps, then today's readiness. */
export function CheckinCard() {
  const { api } = useSession();
  const [today, setToday] = useState<Checkin | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getTodayCheckin()
      .then((c) => active && setToday(c))
      .catch((e: unknown) => active && setError(errorMessage(e)))
      .finally(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, [api]);

  if (!loaded) return null;
  return (
    <section className="card" aria-labelledby="checkin-title">
      <h2 id="checkin-title">Morning check-in</h2>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {today && !editing ? (
        <ReadinessView checkin={today} onEdit={() => setEditing(true)} />
      ) : (
        <CheckinForm
          initial={today}
          onSaved={(saved) => {
            setToday(saved);
            setEditing(false);
            setError(null);
          }}
          onError={setError}
        />
      )}
    </section>
  );
}

function ReadinessView({ checkin, onEdit }: { checkin: Checkin; onEdit: () => void }) {
  const { score, level, limiting_factors } = checkin.readiness;
  return (
    <div className="readiness">
      <p className={`traffic ${level}`} role="status">
        <strong>Readiness {score}/100</strong> – {LEVEL_TEXT[level]}
      </p>
      {limiting_factors.length > 0 && (
        <p className="muted">
          Held back by: {limiting_factors.map((f) => FACTOR_LABELS[f] ?? f).join(", ")}.
        </p>
      )}
      {checkin.pain && (
        <p className="muted">You reported pain. If it does not ease, see a doctor or physio.</p>
      )}
      <button type="button" className="link" onClick={onEdit}>
        Change today's answers
      </button>
    </div>
  );
}

function CheckinForm({
  initial,
  onSaved,
  onError,
}: {
  initial: Checkin | null;
  onSaved: (checkin: Checkin) => void;
  onError: (message: string) => void;
}) {
  const { api } = useSession();
  const [answers, setAnswers] = useState<Partial<Record<Scale, number>>>(() =>
    initial
      ? { sleep_quality: initial.sleep_quality, soreness: initial.soreness, mood: initial.mood }
      : {},
  );
  const [sleepHours, setSleepHours] = useState(initial?.sleep_hours?.toString() ?? "");
  const [pain, setPain] = useState(initial?.pain ?? false);
  const [busy, setBusy] = useState(false);

  const complete = QUESTIONS.every((q) => answers[q.key] !== undefined);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!complete) return;
    const body: CheckinIn = {
      sleep_quality: answers.sleep_quality!,
      soreness: answers.soreness!,
      mood: answers.mood!,
      pain,
      ...(sleepHours ? { sleep_hours: Number(sleepHours) } : {}),
    };
    setBusy(true);
    try {
      onSaved(await api.saveCheckin(isoDate(new Date()), body));
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label="Morning check-in">
      {QUESTIONS.map((q) => (
        <fieldset key={q.key} className="scale">
          <legend>{q.question}</legend>
          <div className="scale-options">
            {[1, 2, 3, 4, 5].map((value) => (
              <label key={value} className={answers[q.key] === value ? "selected" : ""}>
                <input
                  type="radio"
                  name={q.key}
                  value={value}
                  checked={answers[q.key] === value}
                  onChange={() => setAnswers((a) => ({ ...a, [q.key]: value }))}
                  aria-label={`${value} of 5${value === 1 ? ` (${q.low})` : value === 5 ? ` (${q.high})` : ""}`}
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
          type="number"
          inputMode="decimal"
          min={0}
          max={16}
          step={0.5}
          value={sleepHours}
          onChange={(e) => setSleepHours(e.target.value)}
        />
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={pain} onChange={(e) => setPain(e.target.checked)} />
        I have pain today (not normal muscle soreness)
      </label>
      <button type="submit" disabled={!complete || busy}>
        {busy ? "Saving…" : "Save check-in"}
      </button>
    </form>
  );
}
