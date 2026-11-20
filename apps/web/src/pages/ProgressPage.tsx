import type { Checkin, DailyTotals, NutritionTargets, TrainingLoad, WeightHistory } from "@buddy/api-client";
import { CHECKIN_RANGE_DAYS, PROGRESS_RANGES, daysBefore, localToday, mkNumber } from "@buddy/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { useI18n } from "../i18n";
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
  const { t, s } = useI18n();
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
        <h1>{t.progress.title}</h1>
        <div className="segmented" role="group" aria-label={t.progress.period}>
          {PROGRESS_RANGES.map((r) => (
            <button key={r.days} type="button" aria-pressed={days === r.days} onClick={() => setDays(r.days)}>
              {s.rangeLabel[r.days]}
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!data && !error && <p className="muted">{t.loading}</p>}
      </section>
      {data && <Sections data={data} />}
    </main>
  );
}

function Sections({ data }: { data: Data }) {
  const { t, s, locale } = useI18n();
  const kg = (value: number) => (locale === "mk" ? mkNumber(value.toFixed(1)) : value.toFixed(1));
  const { weights, food, targets, load, checkins, days, range, checkinRange } = data;
  const trend = weights.trend.map((t) => ({ day: t.day, value: t.weight_kg }));
  const measured = weights.weights.map((w) => ({ day: w.day, value: w.weight_kg }));
  const readiness = checkins.map((c) => ({ day: c.day, value: c.readiness.score }));

  return (
    <>
      <section className="card" aria-labelledby="p-weight">
        <h2 id="p-weight">{t.progress.weight}</h2>
        {trend.length === 0 ? (
          <p className="muted">{t.progress.noWeights}</p>
        ) : (
          <>
            <p>
              {s.trendChangeText(weights.trend) ??
                t.progress.latest(kg(weights.weights[0]?.weight_kg ?? 0))}
            </p>
            <LineChart
              label={t.progress.weightChart(days)}
              days={range}
              unit={t.units.kg}
              series={[
                { name: t.progress.measured, points: measured, tone: "muted" },
                { name: t.progress.trend, points: trend, tone: "accent" },
              ]}
            />
          </>
        )}
      </section>

      <section className="card" aria-labelledby="p-food">
        <h2 id="p-food">{t.progress.food}</h2>
        {food.length === 0 ? (
          <p className="muted">{t.progress.noFood}</p>
        ) : (
          <>
            <p>{s.foodSummary(food, targets)}</p>
            <BarChart
              label={t.progress.kcalChart(days, targets?.kcal ?? null)}
              days={range}
              unit={t.units.kcal}
              target={targets?.kcal ?? null}
              points={food.map((d) => ({ day: d.day, value: d.kcal }))}
            />
          </>
        )}
      </section>

      <section className="card" aria-labelledby="p-training">
        <h2 id="p-training">{t.progress.training}</h2>
        {load.days.every((d) => d.load === 0) ? (
          <p className="muted">{t.progress.noWorkouts}</p>
        ) : (
          <>
            <p>{s.trainingSummary(load.today, load.acute_chronic_ratio)}</p>
            <LineChart
              label={t.progress.loadChart(days)}
              days={range}
              unit=""
              series={[
                {
                  name: t.progress.fitness,
                  points: load.days.map((d) => ({ day: d.day, value: d.fitness })),
                  tone: "accent",
                },
                {
                  name: t.progress.fatigue,
                  points: load.days.map((d) => ({ day: d.day, value: d.fatigue })),
                  tone: "warm",
                },
              ]}
            />
          </>
        )}
      </section>

      <section className="card" aria-labelledby="p-photos">
        <h2 id="p-photos">{t.progress.photos}</h2>
        <PhotoStrip kind="progress" title={t.progress.photos} range={{ from: range[0], to: range[1] }} />
        <p className="muted small">{t.progress.photosNote}</p>
      </section>

      <section className="card" aria-labelledby="p-readiness">
        <h2 id="p-readiness">{t.progress.readiness}</h2>
        {readiness.length === 0 ? (
          <p className="muted">{t.progress.noCheckins}</p>
        ) : (
          <>
            <p>{s.readinessSummary(readiness.map((r) => r.value), days)}</p>
            <LineChart
              label={t.progress.readinessChart}
              days={checkinRange}
              unit=""
              values={[0, 100]}
              series={[{ name: t.progress.readiness, points: readiness, tone: "accent" }]}
            />
          </>
        )}
      </section>
    </>
  );
}
