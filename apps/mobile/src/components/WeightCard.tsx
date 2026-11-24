import type { WeightHistory } from "@buddy/api-client";
import { parseWeightKg, scaleSeries } from "@buddy/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { useI18n } from "../i18n";
import { errorMessage, useSession } from "../lib/session";
import { TOUCH_TARGET, colors, font, space } from "../theme";
import { Button, Card, ErrorBanner, Field } from "./ui";

const CHART = { width: 320, height: 110 };
const RECENT = 3;

type Load = { state: "loading" } | { state: "failed"; error: string } | { state: "ready"; history: WeightHistory };

/** Latest weight, its 90-day trend, quick entry and the last few measurements. */
export function WeightCard({ reloadKey = 0 }: { reloadKey?: number }) {
  const { api } = useSession();
  const { t, s, num } = useI18n();
  const kg = (value: number) => num(value.toFixed(1));
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const fetchHistory = useCallback(async () => {
    const id = ++request.current; // only the newest request may update the card
    try {
      const history = await api.listWeights();
      if (id === request.current) setLoad({ state: "ready", history });
    } catch (e) {
      if (id === request.current)
        setLoad((current) => (current.state === "ready" ? current : { state: "failed", error: errorMessage(e) }));
    }
  }, [api]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory, reloadKey]);

  async function change(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await fetchHistory();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const weight_kg = parseWeightKg(text);
    if (weight_kg === null) {
      setError(s.weightInputError);
      return;
    }
    if (await change(() => api.logWeight({ weight_kg }))) setText("");
  }

  let body;
  if (load.state === "loading") {
    body = <Text style={styles.muted}>{t.loading}</Text>;
  } else if (load.state === "failed") {
    body = (
      <>
        <ErrorBanner message={load.error} />
        <Button variant="secondary" label={t.tryAgain} onPress={() => void fetchHistory()} />
      </>
    );
  } else {
    const { weights, trend } = load.history;
    const latest = weights[0];
    const scaled = scaleSeries(
      trend.map((t) => ({ day: t.day, value: t.weight_kg })),
      CHART.width,
      CHART.height,
    );
    body = latest ? (
      <>
        <Text style={styles.weight}>
          {kg(latest.weight_kg)} <Text style={styles.unit}>{t.units.kg}</Text>
        </Text>
        <Text style={styles.muted}>{s.trendChangeText(trend) ?? t.weight.measured(latest.day)}</Text>
        {scaled.points.length > 1 && (
          <Svg
            width="100%"
            height={CHART.height}
            viewBox={`0 0 ${CHART.width} ${CHART.height}`}
            accessibilityRole="image"
            accessibilityLabel={t.weight.trend(kg(scaled.points[0]!.value), kg(scaled.points[scaled.points.length - 1]!.value))}
          >
            <Path d={scaled.path} stroke={colors.primary} strokeWidth={2.5} fill="none" />
            {scaled.points.map((p) => (
              <Circle key={p.day} cx={p.x} cy={p.y} r={3} fill={colors.primary} />
            ))}
          </Svg>
        )}
        {weights.slice(0, RECENT).map((w) => (
          <View key={w.id} style={styles.entry}>
            <Text style={styles.body}>
              {kg(w.weight_kg)} {t.units.kg}{" "}
              <Text style={styles.muted}>
                · {w.day} · {s.weightSourceLabel[w.source]}
              </Text>
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.weight.deleteEntry(kg(w.weight_kg), w.day)}
              disabled={busy}
              onPress={() => void change(() => api.deleteWeight(w.id))}
              style={styles.delete}
            >
              <Text style={styles.link}>{t.delete}</Text>
            </Pressable>
          </View>
        ))}
      </>
    ) : (
      <Text style={styles.muted}>{s.weightEmpty}</Text>
    );
  }

  return (
    <Card>
      <Text accessibilityRole="header" style={styles.title}>
        {t.weight.title}
      </Text>
      {body}
      <ErrorBanner message={error} />
      <Field
        label={t.weight.input}
        keyboardType="decimal-pad"
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => void save()}
      />
      <Button label={t.weight.save} busy={busy} disabled={!text.trim()} onPress={() => void save()} />
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.title, fontWeight: "600", color: colors.text },
  weight: { fontSize: font.heading, fontWeight: "700", color: colors.text },
  unit: { fontSize: font.body, fontWeight: "400" },
  body: { fontSize: font.body, color: colors.text, flexShrink: 1 },
  muted: { fontSize: font.small, color: colors.muted },
  entry: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  delete: { minHeight: TOUCH_TARGET, justifyContent: "center" },
  link: { color: colors.primary, fontWeight: "600", fontSize: font.body },
});
