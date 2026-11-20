import type { Checkin, Goal, GoalIn } from "@buddy/api-client";
import { READINESS_TEXT, daysBefore, localToday } from "@buddy/shared";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { GREETING, dayPart, longDate, shortDay } from "../lib/greeting";
import { CoachIcon } from "../lib/icons";
import { daysUntil, goalDateBounds } from "../lib/rules";
import { errorMessage, useSession } from "../lib/session";
import { CheckinCard } from "./CheckinCard";
import { TargetsCard } from "./TargetsCard";
import { WeightCard } from "./WeightCard";

const GOAL_LABELS: Record<Goal["goal_type"], string> = {
  lose_weight: "Lose weight",
  gain_weight: "Gain weight",
  maintain_weight: "Maintain weight",
  recomposition: "Recomposition",
  endurance_event: "Endurance event",
  mountain_sport: "Mountain sport",
  strength: "Strength",
  general_fitness: "General fitness",
};

const HISTORY_DAYS = 7;

/** The athlete's day at a glance: check-in, food, goals, weight and the last days. */
export function DashboardPage() {
  const [now, setNow] = useState(() => new Date());
  const [historyVersion, setHistoryVersion] = useState(0);

  useEffect(() => {
    // The greeting follows the clock when the tab is shown again (e.g. the next morning).
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      setNow(new Date());
      setHistoryVersion((v) => v + 1); // a dashboard left open overnight shows the new week
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return (
    <main className="stack">
      <header className="page-header">
        <div>
          <h1>{GREETING[dayPart(now)]}</h1>
          <p className="muted">{longDate(now)}</p>
        </div>
        <Link to="/coach" className="button">
          <CoachIcon />
          Ask your coach
        </Link>
      </header>
      <div className="dashboard">
        <div className="stack">
          <CheckinCard onSaved={() => setHistoryVersion((v) => v + 1)} />
          <TargetsCard />
        </div>
        <div className="stack">
          <GoalsCard />
          <WeightCard />
          <HistoryCard version={historyVersion} />
        </div>
      </div>
    </main>
  );
}

function GoalsCard() {
  const { api } = useSession();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      setGoals(await api.listGoals("active"));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasPrimary = goals.some((g) => g.priority === "primary");

  return (
    <section className="card" aria-labelledby="goals-title">
      <div className="card-header">
        <h2 id="goals-title">Your goals</h2>
        <button
          type="button"
          className="secondary small-button"
          aria-expanded={adding}
          aria-controls="new-goal"
          ref={toggle}
          onClick={() => setAdding((open) => !open)}
        >
          {adding ? "Close" : "New goal"}
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {goals.length === 0 ? (
        <p className="muted">No active goal yet. Add one to get targets and plans that fit.</p>
      ) : (
        <ul className="goals">
          {goals.map((goal) => (
            <li key={goal.id} className={goal.priority === "primary" ? "primary" : ""}>
              <strong>{goal.title}</strong>
              <span className="muted">
                {GOAL_LABELS[goal.goal_type]}
                {goal.priority === "primary" && " · main goal"}
                {goal.target_date && ` · ${daysUntil(goal.target_date)} days to go`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <div id="new-goal" className="drawer">
          <NewGoalForm
            hasPrimary={hasPrimary}
            onCreated={async () => {
              await load();
              setAdding(false);
              toggle.current?.focus(); // the panel closes; focus stays on its button
            }}
          />
        </div>
      )}
    </section>
  );
}

/** The last week's check-ins: only days with one, newest first. */
function HistoryCard({ version }: { version: number }) {
  const { api } = useSession();
  const [days, setDays] = useState<Checkin[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const to = localToday();
    api.listCheckins({ from: daysBefore(to, HISTORY_DAYS - 1), to }).then(
      (checkins) => {
        if (!active) return;
        setDays([...checkins].sort((a, b) => b.day.localeCompare(a.day)));
        setError(null);
      },
      (e: unknown) => active && setError(errorMessage(e)),
    );
    return () => {
      active = false;
    };
  }, [api, version]);

  return (
    <section className="card" aria-labelledby="history-title">
      <h2 id="history-title">Recent days</h2>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {days === null && !error && <p className="muted">Loading…</p>}
      {days?.length === 0 && (
        <p className="muted">No check-ins in the last {HISTORY_DAYS} days yet.</p>
      )}
      {days && days.length > 0 && (
        <ul className="history" aria-label="Readiness of the last days">
          {days.map((c) => (
            <li key={c.day}>
              <span className="history-day">{shortDay(c.day)}</span>
              <span className={`dot ${c.readiness.level}`} aria-hidden="true" />
              <span className="history-text">{READINESS_TEXT[c.readiness.level]}</span>
              <strong className="history-score">{c.readiness.score}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NewGoalForm({
  onCreated,
  hasPrimary,
}: {
  onCreated: () => Promise<void>;
  hasPrimary: boolean;
}) {
  const { api } = useSession();
  const [goalType, setGoalType] = useState<GoalIn["goal_type"]>("general_fitness");
  const [title, setTitle] = useState("");
  const [sport, setSport] = useState<NonNullable<GoalIn["sport"]>>("running");
  const [targetDate, setTargetDate] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [distance, setDistance] = useState("");
  const [makeMain, setMakeMain] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleInput = useRef<HTMLInputElement>(null);

  useEffect(() => titleInput.current?.focus(), []);

  const isEndurance = goalType === "endurance_event";
  const needsSport = isEndurance || goalType === "mountain_sport";
  const needsWeight = goalType === "lose_weight" || goalType === "gain_weight";
  const allowsWeight = needsWeight || goalType === "recomposition";
  // The first goal is the main goal; later ones only replace it when the user says so.
  const main = makeMain ?? !hasPrimary;
  const bounds = goalDateBounds();

  function chooseType(next: GoalIn["goal_type"]) {
    setGoalType(next);
    setSport(next === "mountain_sport" ? "hiking" : "running");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const goal: GoalIn = { goal_type: goalType, title, priority: main ? "primary" : "secondary" };
    if (needsSport) goal.sport = sport;
    if (targetDate) goal.target_date = targetDate;
    if (allowsWeight && targetWeight) goal.target_weight_kg = Number(targetWeight);
    if (isEndurance && distance) goal.event_distance_km = Number(distance);
    try {
      await api.createGoal(goal);
      setTitle("");
      setTargetWeight("");
      setDistance("");
      setTargetDate("");
      setMakeMain(null);
      await onCreated();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <>
      <h3>New goal</h3>
      <form onSubmit={submit} aria-label="New goal" className="grid">
        <label>
          Type
          <select value={goalType} onChange={(e) => chooseType(e.target.value as GoalIn["goal_type"])}>
            {Object.entries(GOAL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Title
          <input
            ref={titleInput}
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        {needsSport && (
          <label>
            Sport
            <select
              value={sport}
              onChange={(e) => setSport(e.target.value as NonNullable<GoalIn["sport"]>)}
            >
              {isEndurance ? (
                <>
                  <option value="running">Running</option>
                  <option value="cycling">Cycling</option>
                  <option value="swimming">Swimming</option>
                  <option value="triathlon">Triathlon</option>
                </>
              ) : (
                <>
                  <option value="hiking">Hiking</option>
                  <option value="ski_touring">Ski touring</option>
                  <option value="alpine_skiing">Alpine skiing</option>
                  <option value="climbing">Climbing</option>
                </>
              )}
            </select>
          </label>
        )}
        {isEndurance && (
          <label>
            Distance (km)
            <input
              type="number"
              min={0.1}
              max={10000}
              step={0.1}
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
            />
          </label>
        )}
        {allowsWeight && (
          <label>
            Target weight (kg){needsWeight ? "" : " – optional"}
            <input
              type="number"
              min={30}
              max={300}
              step={0.1}
              required={needsWeight}
              value={targetWeight}
              onChange={(e) => setTargetWeight(e.target.value)}
            />
          </label>
        )}
        <label>
          Target date{isEndurance ? "" : " – optional"}
          <input
            type="date"
            min={bounds.min}
            max={bounds.max}
            required={isEndurance}
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </label>
        <label className="checkbox span">
          <input type="checkbox" checked={main} onChange={(e) => setMakeMain(e.target.checked)} />
          Make this my main goal
          {hasPrimary && main && <span className="muted"> (your current main goal becomes secondary)</span>}
        </label>
        {error && (
          <p role="alert" className="error span">
            {error}
          </p>
        )}
        <button type="submit" className="span">
          Add goal
        </button>
      </form>
    </>
  );
}
