import type { NutritionTargets } from "@buddy/api-client";
import { INTL_LOCALE, MACROS } from "@buddy/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useI18n } from "../i18n";
import { errorMessage, useSession } from "../lib/session";
import { colors, font, radius, space } from "../theme";
import { Button, Card, ErrorBanner } from "./ui";

type Load =
  | { state: "loading" }
  | { state: "failed"; error: string }
  | { state: "ready"; targets: NutritionTargets | null };

/** Today's calorie and macro targets, with the reasons behind them. A new `reloadKey` reloads it. */
export function TargetsCard({ reloadKey = 0 }: { reloadKey?: number }) {
  const { api } = useSession();
  const { locale, t, s, num } = useI18n();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const request = useRef(0);

  const fetchTargets = useCallback(async () => {
    const id = ++request.current; // only the newest request may update the card
    try {
      const targets = await api.getTodayTargets();
      if (id === request.current) setLoad({ state: "ready", targets });
    } catch (e) {
      // A failed background refresh keeps the numbers on screen.
      if (id === request.current)
        setLoad((current) => (current.state === "ready" ? current : { state: "failed", error: errorMessage(e) }));
    }
  }, [api]);

  useEffect(() => {
    void fetchTargets();
  }, [fetchTargets, reloadKey]);

  let body;
  if (load.state === "loading") {
    body = <Text style={styles.muted}>{t.loading}</Text>;
  } else if (load.state === "failed") {
    body = (
      <>
        <ErrorBanner message={load.error} />
        <Button variant="secondary" label={t.tryAgain} onPress={() => void fetchTargets()} />
      </>
    );
  } else if (!load.targets) {
    body = <Text style={styles.muted}>{s.noTargets}</Text>;
  } else {
    const targets = load.targets;
    body = (
      <>
        <Text style={styles.kcal}>
          {targets.kcal.toLocaleString(INTL_LOCALE[locale])} <Text style={styles.unit}>{t.units.kcal}</Text>
        </Text>
        <Text style={styles.muted}>{s.energyGoalText[targets.goal]}</Text>
        <View style={styles.macros}>
          {MACROS.map(({ key }) => (
            <View
              key={key}
              style={styles.macro}
              accessible
              accessibilityLabel={t.targets.grams(s.macroLabels[key], num(targets[key]))}
            >
              <Text style={styles.muted}>{s.macroLabels[key]}</Text>
              <Text style={styles.macroValue}>
                {num(targets[key])} {t.units.g}
              </Text>
            </View>
          ))}
        </View>
        {targets.reasons.map((r) => (
          <Text key={r} style={styles.muted}>
            {r}
          </Text>
        ))}
      </>
    );
  }

  return (
    <Card>
      <Text accessibilityRole="header" style={styles.title}>
        {t.targets.title}
      </Text>
      {body}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.title, fontWeight: "600", color: colors.text },
  kcal: { fontSize: font.heading, fontWeight: "700", color: colors.text },
  unit: { fontSize: font.body, fontWeight: "400" },
  macros: { flexDirection: "row", gap: space.sm },
  macro: {
    flex: 1,
    alignItems: "center",
    padding: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  macroValue: { fontSize: font.body, fontWeight: "600", color: colors.text },
  muted: { fontSize: font.small, color: colors.muted },
});
