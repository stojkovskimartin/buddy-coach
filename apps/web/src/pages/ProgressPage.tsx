import type { Checkin, DailyTotals, NutritionTargets, TrainingLoad, WeightHistory } from "@buddy/api-client";
import {
  CHECKIN_RANGE_DAYS,
  PROGRESS_RANGES,
  average,
  daysBefore,
  localToday,
  trendChangeText,
} from "@buddy/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { errorMessage, useSession } from "../lib/session";
import { BarChart, LineChart } from "./Charts";
import { PhotoStrip } from "./Photos";

interface Data {
  weights: WeightHistory;
  food: DailyTotals[];
  targets: NutritionTargets | null;
  load: TrainingLoad;
  checkins: Checkin[];
  /** The period these results are for, so charts never mix a new period with old data. */
  days: number;
  range: readonly [string, string];
  checkinRange: readonly [string, string];
}

/** Everything in one place, over 4 weeks, 3 months or a year: weight, food, training, readiness. */
export function ProgressPage() {
  const { api } = useSession();
  const [days, setDays] = useState<number>(PROGRESS_RANGES[0].days);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current; // only the newest range may update the page
    setData(null);
    const to = localToday();
    const from = daysBefore(to, days - 1);
    const checkinFrom = days > CHECKIN_RANGE_DAYS ? daysBefore(to, CHECKIN_RANGE_DAYS - 1) : from;
    try {
      const [weights, food, targets, trainingLoad, checkins] = await Promise.all([
        api.listWeights({ from, to }),
        api.listDailyTotals({ from, to }),
        api.getTodayTargets(),
        api.getTrainingLoad(days),
        api.listCheckins({ from: checkinFrom, to }),
      ]);
      if (id !== request.current) return;
      setData({
        weights,
        food,
        targets,
        load: trainingLoad,
        checkins,
        days,
        range: [from, to],
        checkinRange: [checkinFrom, to],
      });
      setError(null);
    } catch (e) {
      if (id === request.current) setError(errorMessage(e));
    }
  }, [api, days]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="stack">
      <section className="card">
        <h1>Progress</h1>
        <div className="segmented" role="group" aria-label="Period">
          {PROGRESS_RANGES.map((r) => (
            <button key={r.days} type="button" aria-pressed={days === r.days} onClick={() => setDays(r.days)}>
              {r.label}
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!data && !error && <p className="muted">Loading…</p>}
      </section>
      {data && <Sections data={data} />}
    </main>
  );
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function Sections({ data }: { data: Data }) {
  const { weights, food, targets, load, checkins, days, range, checkinRange } = data;
  const trend = weights.trend.map((t) => ({ day: t.day, value: t.weight_kg }));
  const measured = weights.weights.map((w) => ({ day: w.day, value: w.weight_kg }));
  const avgKcal = average(food.map((d) => d.kcal));
  const avgProtein = average(food.map((d) => d.protein_g));
  const readiness = checkins.map((c) => ({ day: c.day, value: c.readiness.score }));

  return (
    <>
      <section className="card" aria-labelledby="p-weight">
        <h2 id="p-weight">Weight</h2>
        {trend.length === 0 ? (
          <p className="muted">No weights in this period yet.</p>
        ) : (
          <>
            <p>{trendChangeText(weights.trend) ?? `Latest ${weights.weights[0]?.weight_kg.toFixed(1)} kg`}</p>
            <LineChart
              label={`Weight over ${days} days, 7-day trend and measurements`}
              days={range}
              unit="kg"
              series={[
                { name: "Measured", points: measured, tone: "muted" },
                { name: "7-day trend", points: trend, tone: "accent" },
              ]}
            />
          </>
        )}
      </section>

      <section className="card" aria-labelledby="p-food">
        <h2 id="p-food">Food</h2>
        {food.length === 0 ? (
          <p className="muted">No food logged in this period yet.</p>
        ) : (
          <>
            <p>
              {plural(food.length, "day")} logged · on average {avgKcal} kcal and {avgProtein} g protein
              {targets ? ` (today's target: ${targets.kcal} kcal, ${targets.protein_g} g protein)` : ""}
            </p>
            <BarChart
              label={`Calories per logged day over ${days} days${targets ? `, line at today's target of ${targets.kcal} kcal` : ""}`}
              days={range}
              unit="kcal"
              target={targets?.kcal ?? null}
              points={food.map((d) => ({ day: d.day, value: d.kcal }))}
            />
          </>
        )}
      </section>

      <section className="card" aria-labelledby="p-training">
        <h2 id="p-training">Training</h2>
        {load.days.every((d) => d.load === 0) ? (
          <p className="muted">No workouts in this period yet.</p>
        ) : (
          <>
            <p>
              Fitness {load.today.fitness} · fatigue {load.today.fatigue} · form {load.today.form}
              {load.acute_chronic_ratio !== null ? ` · load ratio ${load.acute_chronic_ratio}` : ""}
            </p>
            <LineChart
              label={`Fitness and fatigue over ${days} days`}
              days={range}
              unit=""
              series={[
                {
                  name: "Fitness",
                  points: load.days.map((d) => ({ day: d.day, value: d.fitness })),
                  tone: "accent",
                },
                {
                  name: "Fatigue",
                  points: load.days.map((d) => ({ day: d.day, value: d.fatigue })),
                  tone: "warm",
                },
              ]}
            />
          </>
        )}
      </section>

      <section className="card" aria-labelledby="p-photos">
        <h2 id="p-photos">Progress photos</h2>
        <PhotoStrip kind="progress" title="Progress photos" range={{ from: range[0], to: range[1] }} />
        <p className="muted small">Only you can see them. They are stored without location data.</p>
      </section>

      <section className="card" aria-labelledby="p-readiness">
        <h2 id="p-readiness">Readiness</h2>
        {readiness.length === 0 ? (
          <p className="muted">No check-ins in this period yet.</p>
        ) : (
          <>
            <p>
              {plural(readiness.length, "check-in")} · on average {average(readiness.map((r) => r.value))} of
              100
              {days > CHECKIN_RANGE_DAYS ? ` (last ${CHECKIN_RANGE_DAYS} days)` : ""}
            </p>
            <LineChart
              label="Readiness score per check-in, 0 to 100"
              days={checkinRange}
              unit=""
              values={[0, 100]}
              series={[{ name: "Readiness", points: readiness, tone: "accent" }]}
            />
          </>
        )}
      </section>
    </>
  );
}
