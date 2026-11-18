import type { Goal, GoalIn } from "@buddy/api-client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { daysUntil, goalDateBounds } from "../lib/rules";
import { errorMessage, useSession } from "../lib/session";
import { CheckinCard } from "./CheckinCard";

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

export function DashboardPage() {
  const { api } = useSession();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [error, setError] = useState<string | null>(null);

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
    <main className="stack">
      <CheckinCard />
      <section className="card">
        <h1>Your goals</h1>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {goals.length === 0 ? (
          <p className="muted">No active goal yet. Add one below.</p>
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
        <Link to="/coach" className="button">
          Ask your coach
        </Link>
      </section>
      <NewGoalForm onCreated={load} hasPrimary={hasPrimary} />
    </main>
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
    <section className="card">
      <h2>New goal</h2>
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
          <input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
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
    </section>
  );
}
