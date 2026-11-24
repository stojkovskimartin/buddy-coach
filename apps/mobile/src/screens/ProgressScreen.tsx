import type { Checkin, DailyTotals, NutritionTargets, TrainingLoad, WeightHistory } from "@buddy/api-client";
import { CHECKIN_RANGE_DAYS, PROGRESS_RANGES, daysBefore, localToday } from "@buddy/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { BarChart, LineChart } from "../components/Charts";
import { PhotoStrip } from "../components/PhotoStrip";
import { Card, ErrorBanner } from "../components/ui";
import { useI18n } from "../i18n";
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
  const { t, s } = useI18n();
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
        {t.progress.title}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={t.progress.period} style={styles.periods}>
        {PROGRESS_RANGES.map((r) => (
          <Pressable
            key={r.days}
            accessibilityRole="radio"
            accessibilityState={{ checked: days === r.days }}
            onPress={() => setDays(r.days)}
            style={[styles.period, days === r.days && styles.periodOn]}
          >
            <Text style={[styles.periodText, days === r.days && styles.periodTextOn]}>{s.rangeLabel[r.days]}</Text>
          </Pressable>
        ))}
      </View>
      <ErrorBanner message={error} />
      {!shown && !error && <Text style={styles.muted}>{t.loading}</Text>}
      {shown && <Sections data={shown} />}
    </ScrollView>
  );
}

function Sections({ data }: { data: Data }) {
  const { t, s, num } = useI18n();
  const { weights, food, targets, load, checkins, days, range, checkinRange } = data;
  const trend = weights.trend.map((t) => ({ day: t.day, value: t.weight_kg }));
  const measured = weights.weights.map((w) => ({ day: w.day, value: w.weight_kg }));
  const readiness = checkins.map((c) => ({ day: c.day, value: c.readiness.score }));

  return (
    <>
      <Card>
        <Text accessibilityRole="header" style={styles.heading}>
          {t.progress.weight}
        </Text>
        {trend.length === 0 ? (
          <Text style={styles.muted}>{t.progress.noWeights}</Text>
        ) : (
          <>
            <Text style={styles.body}>
              {s.trendChangeText(weights.trend) ?? t.progress.latest(num(weights.weights[0]?.weight_kg.toFixed(1) ?? ""))}
            </Text>
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
      </Card>

      <Card>
        <Text accessibilityRole="header" style={styles.heading}>
          {t.progress.food}
        </Text>
        {food.length === 0 ? (
          <Text style={styles.muted}>{t.progress.noFood}</Text>
        ) : (
          <>
            <Text style={styles.body}>{s.foodSummary(food, targets)}</Text>
            <BarChart
              label={t.progress.kcalChart(days, targets?.kcal ?? null)}
              days={range}
              unit={t.units.kcal}
              target={targets?.kcal ?? null}
              points={food.map((d) => ({ day: d.day, value: d.kcal }))}
            />
          </>
        )}
      </Card>

      <Card>
        <Text accessibilityRole="header" style={styles.heading}>
          {t.progress.training}
        </Text>
        {load.days.every((d) => d.load === 0) ? (
          <Text style={styles.muted}>{t.progress.noWorkouts}</Text>
        ) : (
          <>
            <Text style={styles.body}>{s.trainingSummary(load.today, load.acute_chronic_ratio)}</Text>
            <LineChart
              label={t.progress.loadChart(days)}
              days={range}
              unit=""
              series={[
                { name: t.progress.fitness, points: load.days.map((d) => ({ day: d.day, value: d.fitness })), tone: "accent" },
                { name: t.progress.fatigue, points: load.days.map((d) => ({ day: d.day, value: d.fatigue })), tone: "warm" },
              ]}
            />
          </>
        )}
      </Card>

      <Card>
        <Text accessibilityRole="header" style={styles.heading}>
          {t.progress.photos}
        </Text>
        <PhotoStrip
          kind="progress"
          title={t.progress.photos}
          one={t.progress.onePhoto}
          range={{ from: range[0], to: range[1] }}
        />
        <Text style={styles.muted}>{t.progress.photosNote}</Text>
      </Card>

      <Card>
        <Text accessibilityRole="header" style={styles.heading}>
          {t.progress.readiness}
        </Text>
        {readiness.length === 0 ? (
          <Text style={styles.muted}>{t.progress.noCheckins}</Text>
        ) : (
          <>
            <Text style={styles.body}>{s.readinessSummary(readiness.map((r) => r.value), days)}</Text>
            <LineChart
              label={t.progress.readinessChart}
              days={checkinRange}
              unit=""
              values={[0, 100]}
              series={[{ name: t.progress.readiness, points: readiness, tone: "accent" }]}
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
