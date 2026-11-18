import type { Checkin, CheckinIn, Readiness } from "@buddy/api-client";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { errorMessage, useSession } from "../lib/session";
import { TOUCH_TARGET, colors, font, radius, space } from "../theme";
import { Button, Card, ErrorBanner } from "./ui";

type Scale = "sleep_quality" | "soreness" | "mood";

/** The three morning questions, 1 (bad) to 5 (great). Same wording as the web app. */
export const QUESTIONS: { key: Scale; question: string; low: string; high: string }[] = [
  { key: "sleep_quality", question: "How did you sleep?", low: "Very badly", high: "Great" },
  { key: "soreness", question: "How do your muscles feel?", low: "Very sore", high: "Fresh" },
  { key: "mood", question: "How do you feel?", low: "Very low", high: "Great" },
];

const LEVEL_TEXT: Record<Readiness["level"], string> = {
  green: "Ready to train as planned.",
  amber: "Train, but keep it easy today.",
  red: "Rest or recovery only today.",
};

const LEVEL_COLORS: Record<Readiness["level"], { background: string; text: string }> = {
  green: { background: "#dcfce7", text: "#14532d" },
  amber: { background: "#fef3c7", text: "#78350f" },
  red: { background: colors.dangerSurface, text: colors.danger },
};

const FACTOR_LABELS: Record<string, string> = {
  sleep: "sleep",
  soreness: "sore muscles",
  mood: "mood",
  hrv: "heart rate variability",
  resting_hr: "resting heart rate",
  training_load: "recent training load",
  pain: "pain",
};

/** Today's date as YYYY-MM-DD in the phone's time zone. */
export function localIsoDate(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Morning check-in: three taps, then today's readiness. `reloadKey` reloads it. */
export function CheckinCard({ reloadKey = 0 }: { reloadKey?: number }) {
  const { api } = useSession();
  const [today, setToday] = useState<Checkin | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getTodayCheckin()
      .then((c) => active && setToday(c))
      .catch((e: unknown) => active && setError(errorMessage(e)))
      .finally(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, [api, reloadKey]);

  if (!loaded) return null;
  return (
    <Card>
      <Text accessibilityRole="header" style={styles.title}>
        Morning check-in
      </Text>
      <ErrorBanner message={error} />
      {today && !editing ? (
        <ReadinessView checkin={today} onEdit={() => setEditing(true)} />
      ) : (
        <CheckinForm
          initial={today}
          onSaved={(saved) => {
            setToday(saved);
            setEditing(false);
            setError(null);
          }}
          onError={setError}
        />
      )}
    </Card>
  );
}

function ReadinessView({ checkin, onEdit }: { checkin: Checkin; onEdit: () => void }) {
  const { score, level, limiting_factors } = checkin.readiness;
  const tone = LEVEL_COLORS[level];
  return (
    <View style={styles.gap}>
      <View
        accessible
        accessibilityLiveRegion="polite"
        testID="readiness"
        style={[styles.traffic, { backgroundColor: tone.background }]}
      >
        <Text style={[styles.score, { color: tone.text }]}>Readiness {score}/100</Text>
        <Text style={{ color: tone.text }}>{LEVEL_TEXT[level]}</Text>
      </View>
      {limiting_factors.length > 0 && (
        <Text style={styles.muted}>
          Held back by: {limiting_factors.map((f) => FACTOR_LABELS[f] ?? f).join(", ")}.
        </Text>
      )}
      {checkin.pain && (
        <Text style={styles.muted}>
          You reported pain. If it does not ease, see a doctor or physio.
        </Text>
      )}
      <Button variant="secondary" label="Change today's answers" onPress={onEdit} />
    </View>
  );
}

function CheckinForm({
  initial,
  onSaved,
  onError,
}: {
  initial: Checkin | null;
  onSaved: (checkin: Checkin) => void;
  onError: (message: string) => void;
}) {
  const { api } = useSession();
  const [answers, setAnswers] = useState<Partial<Record<Scale, number>>>(() =>
    initial
      ? { sleep_quality: initial.sleep_quality, soreness: initial.soreness, mood: initial.mood }
      : {},
  );
  const [sleepHours, setSleepHours] = useState(initial?.sleep_hours?.toString() ?? "");
  const [pain, setPain] = useState(initial?.pain ?? false);
  const [busy, setBusy] = useState(false);

  const hours = sleepHours.trim() ? Number(sleepHours.replace(",", ".")) : null;
  const hoursInvalid = hours !== null && (Number.isNaN(hours) || hours < 0 || hours > 16);
  const complete = QUESTIONS.every((q) => answers[q.key] !== undefined) && !hoursInvalid;

  async function submit() {
    if (!complete || busy) return;
    const body: CheckinIn = {
      sleep_quality: answers.sleep_quality!,
      soreness: answers.soreness!,
      mood: answers.mood!,
      pain,
      ...(hours !== null ? { sleep_hours: hours } : {}),
    };
    setBusy(true);
    try {
      onSaved(await api.saveCheckin(localIsoDate(), body));
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.gap}>
      {QUESTIONS.map((q) => (
        <View key={q.key} style={styles.question}>
          <Text style={styles.label}>{q.question}</Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={q.question}
            testID={`scale-${q.key}`}
            style={styles.scale}
          >
            {[1, 2, 3, 4, 5].map((value) => {
              const selected = answers[q.key] === value;
              const ends = value === 1 ? ` (${q.low})` : value === 5 ? ` (${q.high})` : "";
              return (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityLabel={`${value} of 5${ends}`}
                  accessibilityState={{ checked: selected }}
                  onPress={() => setAnswers((a) => ({ ...a, [q.key]: value }))}
                  style={[styles.option, selected && styles.selected]}
                >
                  <Text style={[styles.optionText, selected && styles.selectedText]}>{value}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.ends} importantForAccessibility="no-hide-descendants">
            <Text style={styles.small}>{q.low}</Text>
            <Text style={styles.small}>{q.high}</Text>
          </View>
        </View>
      ))}
      <View style={styles.question}>
        <Text style={styles.label}>Hours of sleep (optional)</Text>
        <TextInput
          accessibilityLabel="Hours of sleep (optional)"
          keyboardType="decimal-pad"
          value={sleepHours}
          onChangeText={setSleepHours}
          style={styles.input}
        />
        {hoursInvalid && <Text style={styles.error}>Enter 0 to 16 hours.</Text>}
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>I have pain today (not normal muscle soreness)</Text>
        <Switch
          accessibilityLabel="I have pain today"
          value={pain}
          onValueChange={setPain}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>
      <Button
        label="Save check-in"
        onPress={() => void submit()}
        disabled={!complete}
        busy={busy}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.title, fontWeight: "600", color: colors.text },
  gap: { gap: space.md },
  question: { gap: space.xs },
  label: { fontSize: font.body, fontWeight: "600", color: colors.text },
  scale: { flexDirection: "row", gap: space.sm },
  option: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { fontSize: font.body, fontWeight: "600", color: colors.text },
  selectedText: { color: colors.primaryText },
  ends: { flexDirection: "row", justifyContent: "space-between" },
  small: { fontSize: font.small, color: colors.muted },
  input: {
    minHeight: TOUCH_TARGET,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    fontSize: font.body,
    color: colors.text,
  },
  error: { fontSize: font.small, color: colors.danger },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  rowLabel: { flex: 1, fontSize: font.body, color: colors.text },
  traffic: { borderRadius: radius.sm, padding: space.md, gap: space.xs },
  score: { fontSize: font.body, fontWeight: "700" },
  muted: { fontSize: font.small, color: colors.muted },
});
