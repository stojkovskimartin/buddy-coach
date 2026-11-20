import type { Checkin, CheckinIn } from "@buddy/api-client";
import { SCALE_VALUES, parseSleepHours, type CheckinScale } from "@buddy/shared";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { useI18n } from "../i18n";
import { checkinSkippedToday, dayPart, skipCheckinToday } from "../lib/greeting";
import { errorMessage, useSession } from "../lib/session";

type Load = { state: "loading" } | { state: "failed"; error: string } | { state: "ready" };

/**
 * Daily check-in: three taps, then today's readiness. Optional: "Not now" folds it away for the
 * day. Asks about the day so far after the morning. Reloads when the tab is shown again.
 */
export function CheckinCard({ onSaved }: { onSaved?: () => void } = {}) {
  const { api } = useSession();
  const { t } = useI18n();
  const [part, setPart] = useState(dayPart);
  const [skipped, setSkipped] = useState(checkinSkippedToday);
  const checkInButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const changedByClick = useRef(false);
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
      if (id !== request.current) return;
      // After a first successful load, a failed background refresh keeps what is on screen
      // (and anything being typed) and only reports the problem.
      const message = errorMessage(e);
      setLoad((current) => (current.state === "ready" ? current : { state: "failed", error: message }));
      setSaveError((current) => current ?? message);
    }
  }, [api]);

  useEffect(() => {
    void fetchToday();
    // A dashboard left open overnight shows the new day when the tab is visible again.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      setPart(dayPart());
      setSkipped(checkinSkippedToday());
      void fetchToday();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [fetchToday]);

  useEffect(() => {
    // Keep keyboard focus on the card when the form folds away or opens again.
    if (!changedByClick.current) return;
    changedByClick.current = false;
    if (skipped) checkInButton.current?.focus();
    else heading.current?.focus();
  }, [skipped]);

  function skip(value: boolean) {
    skipCheckinToday(value);
    changedByClick.current = true;
    setSkipped(value);
  }

  let body;
  if (load.state === "loading") {
    body = (
      <p className="muted">{t.loading}</p>
    );
  } else if (load.state === "failed") {
    // Never show an empty form here: saving it would overwrite a check-in we could not load.
    body = (
      <>
        <p role="alert" className="error">
          {load.error}
        </p>
        <button type="button" onClick={() => void fetchToday()}>
          {t.tryAgain}
        </button>
      </>
    );
  } else if (today && !editing) {
    body = <ReadinessView checkin={today} onEdit={() => setEditing(true)} />;
  } else if (!today && skipped) {
    body = (
      <div className="skipped">
        <p className="muted">{t.checkin.skipped}</p>
        <button type="button" className="secondary" ref={checkInButton} onClick={() => skip(false)}>
          {t.checkin.checkIn}
        </button>
      </div>
    );
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
            request.current++; // a load started before the save must not undo it
            setToday(saved);
            setEditing(false);
            onSaved?.();
          }}
          onError={setSaveError}
          {...(today ? {} : { onSkip: () => skip(true) })}
        />
      </>
    );
  }

  return (
    <section className="card" aria-labelledby="checkin-title">
      <div className="card-header">
        <h2 id="checkin-title" ref={heading} tabIndex={-1}>
          {t.checkinPrompt[part]}
        </h2>
        {load.state === "ready" && !today && <span className="badge">{t.checkin.optional}</span>}
      </div>
      {body}
    </section>
  );
}

function ReadinessView({ checkin, onEdit }: { checkin: Checkin; onEdit: () => void }) {
  const { t, s } = useI18n();
  const { score, level, limiting_factors } = checkin.readiness;
  const limiting = s.limitingText(limiting_factors);
  return (
    <div className="readiness">
      <p className={`traffic ${level}`} role="status">
        <strong>{t.checkin.readiness(score)}</strong> – {s.readinessText[level]}
      </p>
      {limiting && <p className="muted">{limiting}</p>}
      {checkin.pain && <p>{s.painNote}</p>}
      <p className="muted small">{s.readinessNote}</p>
      <button type="button" className="link" onClick={onEdit}>
        {t.checkin.change}
      </button>
    </div>
  );
}

function CheckinForm({
  initial,
  onSaving,
  onSaved,
  onError,
  onSkip,
}: {
  initial: Checkin | null;
  onSaving: () => void;
  onSaved: (checkin: Checkin) => void;
  onError: (message: string) => void;
  /** Only for a new check-in: fold the card away for today. */
  onSkip?: () => void;
}) {
  const { api } = useSession();
  const { t, s } = useI18n();
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
    s.checkinQuestions.every((q) => answers[q.key] !== undefined) && hours !== "invalid";

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
    <form onSubmit={submit} aria-label={t.checkin.form}>
      {s.checkinQuestions.map((q) => (
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
                  aria-label={s.scaleOptionLabel(value, q)}
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
        {t.checkin.sleepHours}
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
          {s.sleepHoursError}
        </p>
      )}
      <label className="checkbox">
        <input type="checkbox" checked={pain} onChange={(e) => setPain(e.target.checked)} />
        {s.painLabel}
      </label>
      <div className="actions">
        <button type="submit" disabled={!complete || busy}>
          {busy ? t.checkin.saving : t.checkin.save}
        </button>
        {onSkip && (
          <button type="button" className="ghost" onClick={onSkip}>
            {t.checkin.notNow}
          </button>
        )}
      </div>
    </form>
  );
}
