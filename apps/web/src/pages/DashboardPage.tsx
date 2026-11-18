import type { Goal, GoalIn } from "@buddy/api-client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { errorMessage, useSession } from "../lib/session";

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

function daysUntil(date: string): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

export function DashboardPage() {
  const { api } = useSession();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setGoals(await api.listGoals("active"));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="stack">
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
      <NewGoalForm onCreated={load} />
    </main>
  );
}

function NewGoalForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const { api } = useSession();
  const [goalType, setGoalType] = useState<GoalIn["goal_type"]>("general_fitness");
  const [title, setTitle] = useState("");
  const [sport, setSport] = useState<NonNullable<GoalIn["sport"]>>("running");
  const [targetDate, setTargetDate] = useState("");
  const [targetWeight, setTargetWeight] = useState("");
  const [error, setError] = useState<string | null>(null);

  const needsSport = goalType === "endurance_event" || goalType === "mountain_sport";
  const needsWeight = goalType === "lose_weight" || goalType === "gain_weight";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const goal: GoalIn = { goal_type: goalType, title };
    if (needsSport) goal.sport = sport;
    if (targetDate) goal.target_date = targetDate;
    if (needsWeight && targetWeight) goal.target_weight_kg = Number(targetWeight);
    try {
      await api.createGoal(goal);
      setTitle("");
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
          <select
            value={goalType}
            onChange={(e) => setGoalType(e.target.value as GoalIn["goal_type"])}
          >
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
              {goalType === "endurance_event" ? (
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
        {needsWeight && (
          <label>
            Target weight (kg)
            <input
              type="number"
              min={30}
              max={300}
              step={0.1}
              required
              value={targetWeight}
              onChange={(e) => setTargetWeight(e.target.value)}
            />
          </label>
        )}
        <label>
          Target date
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
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
