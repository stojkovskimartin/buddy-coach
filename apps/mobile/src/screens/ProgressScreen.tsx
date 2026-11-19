import type { Checkin, DailyTotals, NutritionTargets, TrainingLoad, WeightHistory } from "@buddy/api-client";
import {
  CHECKIN_RANGE_DAYS,
  PROGRESS_RANGES,
  daysBefore,
  foodSummary,
  localToday,
  readinessSummary,
  trainingSummary,
  trendChangeText,
} from "@buddy/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { BarChart, LineChart } from "../components/Charts";
import { PhotoStrip } from "../components/PhotoStrip";
import { Card, ErrorBanner } from "../components/ui";
import { errorMessage, useSession } from "../lib/session";
import { TOUCH_TARGET, colors, font, radius, space } from "../theme";

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

/** Weight, food, training and readiness over 4 weeks, 3 months or a year. Loads when first shown
 * and again each time the tab is shown. */
export function ProgressScreen({ active = true }: { active?: boolean }) {
  const { api } = useSession();
  const [days, setDays] = useState<number>(PROGRESS_RANGES[0].days);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current; // only the newest period may update the screen
    setLoading(true);
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
      setData({ weights, food, targets, load: trainingLoad, checkins, days, range: [from, to], checkinRange: [checkinFrom, to] });
      setError(null);
    } catch (e) {
      if (id === request.current) setError(errorMessage(e));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [api, days]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const shown = data?.days === days ? data : null;

  return (
    <ScrollView
      contentContainerStyle={styles.screen}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
    >
      <Text accessibilityRole="header" style={styles.title}>
        Progress
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Period" style={styles.periods}>
        {PROGRESS_RANGES.map((r) => (
          <Pressable
            key={r.days}
            accessibilityRole="radio"
            accessibilityState={{ checked: days === r.days }}
            onPress={() => setDays(r.days)}
            style={[styles.period, days === r.days && styles.periodOn]}
          >
            <Text style={[styles.periodText, days === r.days && styles.periodTextOn]}>{r.label}</Text>
          </Pressable>
        ))}
      </View>
      <ErrorBanner message={error} />
      {!shown && !error && <Text style={styles.muted}>Loading…</Text>}
      {shown && <Sections data={shown} />}
    </ScrollView>
  );
}

function Sections({ data }: { data: Data }) {
  const { weights, food, targets, load, checkins, days, range, checkinRange } = data;
  const trend = weights.trend.map((t) => ({ day: t.day, value: t.weight_kg }));
  const measured = weights.weights.map((w) => ({ day: w.day, value: w.weight_kg }));
  const readiness = checkins.map((c) => ({ day: c.day, value: c.readiness.score }));

  return (
    <>
      <Card>
        <Text accessibilityRole="header" style={styles.heading}>
          Weight
        </Text>
        {trend.length === 0 ? (
          <Text style={styles.muted}>No weights in this period yet.</Text>
        ) : (
          <>
            <Text style={styles.body}>
              {trendChangeText(weights.trend) ?? `Latest ${weights.weights[0]?.weight_kg.toFixed(1)} kg`}
            </Text>
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
      </Card>

      <Card>
        <Text accessibilityRole="header" style={styles.heading}>
          Food
        </Text>
        {food.length === 0 ? (
          <Text style={styles.muted}>No food logged in this period yet.</Text>
        ) : (
          <>
            <Text style={styles.body}>{foodSummary(food, targets)}</Text>
            <BarChart
              label={`Calories per logged day over ${days} days${targets ? `, line at today's target of ${targets.kcal} kcal` : ""}`}
              days={range}
              unit="kcal"
              target={targets?.kcal ?? null}
              points={food.map((d) => ({ day: d.day, value: d.kcal }))}
            />
          </>
        )}
      </Card>

      <Card>
        <Text accessibilityRole="header" style={styles.heading}>
          Training
        </Text>
        {load.days.every((d) => d.load === 0) ? (
          <Text style={styles.muted}>No workouts in this period yet.</Text>
        ) : (
          <>
            <Text style={styles.body}>{trainingSummary(load.today, load.acute_chronic_ratio)}</Text>
            <LineChart
              label={`Fitness and fatigue over ${days} days`}
              days={range}
              unit=""
              series={[
                { name: "Fitness", points: load.days.map((d) => ({ day: d.day, value: d.fitness })), tone: "accent" },
                { name: "Fatigue", points: load.days.map((d) => ({ day: d.day, value: d.fatigue })), tone: "warm" },
              ]}
            />
          </>
        )}
      </Card>

      <Card>
        <Text accessibilityRole="header" style={styles.heading}>
          Progress photos
        </Text>
        <PhotoStrip kind="progress" title="Progress photos" one="progress photo" range={{ from: range[0], to: range[1] }} />
        <Text style={styles.muted}>Only you can see them. They are stored without location data.</Text>
      </Card>

      <Card>
        <Text accessibilityRole="header" style={styles.heading}>
          Readiness
        </Text>
        {readiness.length === 0 ? (
          <Text style={styles.muted}>No check-ins in this period yet.</Text>
        ) : (
          <>
            <Text style={styles.body}>{readinessSummary(readiness.map((r) => r.value), days)}</Text>
            <LineChart
              label="Readiness score per check-in, 0 to 100"
              days={checkinRange}
              unit=""
              values={[0, 100]}
              series={[{ name: "Readiness", points: readiness, tone: "accent" }]}
            />
          </>
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space.lg, gap: space.lg, backgroundColor: colors.background },
  title: { fontSize: font.heading, fontWeight: "700", color: colors.text },
  heading: { fontSize: font.title, fontWeight: "600", color: colors.text },
  body: { fontSize: font.body, color: colors.text },
  muted: { fontSize: font.small, color: colors.muted },
  periods: { flexDirection: "row", gap: space.sm },
  period: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  periodOn: { backgroundColor: colors.primary },
  periodText: { color: colors.primary, fontSize: font.body },
  periodTextOn: { color: colors.primaryText, fontWeight: "600" },
});
