import type { WeightHistory } from "@buddy/api-client";
import {
  WEIGHT_EMPTY_TEXT,
  WEIGHT_INPUT_ERROR,
  WEIGHT_SOURCE_LABEL,
  parseWeightKg,
  scaleSeries,
  trendChangeText,
} from "@buddy/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { errorMessage, useSession } from "../lib/session";
import { TOUCH_TARGET, colors, font, space } from "../theme";
import { Button, Card, ErrorBanner, Field } from "./ui";

const CHART = { width: 320, height: 110 };
const RECENT = 3;

type Load = { state: "loading" } | { state: "failed"; error: string } | { state: "ready"; history: WeightHistory };

/** Latest weight, its 90-day trend, quick entry and the last few measurements. */
export function WeightCard({ reloadKey = 0 }: { reloadKey?: number }) {
  const { api } = useSession();
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
      setError(WEIGHT_INPUT_ERROR);
      return;
    }
    if (await change(() => api.logWeight({ weight_kg }))) setText("");
  }

  let body;
  if (load.state === "loading") {
    body = <Text style={styles.muted}>Loading…</Text>;
  } else if (load.state === "failed") {
    body = (
      <>
        <ErrorBanner message={load.error} />
        <Button variant="secondary" label="Try again" onPress={() => void fetchHistory()} />
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
          {latest.weight_kg.toFixed(1)} <Text style={styles.unit}>kg</Text>
        </Text>
        <Text style={styles.muted}>{trendChangeText(trend) ?? `Measured ${latest.day}`}</Text>
        {scaled.points.length > 1 && (
          <Svg
            width="100%"
            height={CHART.height}
            viewBox={`0 0 ${CHART.width} ${CHART.height}`}
            accessibilityRole="image"
            accessibilityLabel={`Weight trend (7-day average) from ${scaled.points[0]!.value.toFixed(1)} to ${scaled.points[scaled.points.length - 1]!.value.toFixed(1)} kg`}
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
              {w.weight_kg.toFixed(1)} kg <Text style={styles.muted}>· {w.day} · {WEIGHT_SOURCE_LABEL[w.source]}</Text>
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete ${w.weight_kg.toFixed(1)} kg from ${w.day}`}
              disabled={busy}
              onPress={() => void change(() => api.deleteWeight(w.id))}
              style={styles.delete}
            >
              <Text style={styles.link}>Delete</Text>
            </Pressable>
          </View>
        ))}
      </>
    ) : (
      <Text style={styles.muted}>{WEIGHT_EMPTY_TEXT}</Text>
    );
  }

  return (
    <Card>
      <Text accessibilityRole="header" style={styles.title}>
        Weight
      </Text>
      {body}
      <ErrorBanner message={error} />
      <Field
        label="Weight now (kg)"
        keyboardType="decimal-pad"
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => void save()}
      />
      <Button label="Save weight" busy={busy} disabled={!text.trim()} onPress={() => void save()} />
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
