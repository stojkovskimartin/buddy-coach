import type { Checkin, CheckinIn, Readiness } from "@buddy/api-client";
import {
  CHECKIN_QUESTIONS,
  PAIN_LABEL,
  PAIN_NOTE,
  READINESS_NOTE,
  READINESS_TEXT,
  SCALE_VALUES,
  SLEEP_HOURS_ERROR,
  limitingText,
  parseSleepHours,
  scaleOptionLabel,
  type CheckinScale,
} from "@buddy/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { errorMessage, useSession } from "../lib/session";
import { TOUCH_TARGET, colors, font, radius, space } from "../theme";
import { Button, Card, ErrorBanner } from "./ui";

const LEVEL_COLORS: Record<Readiness["level"], { background: string; text: string }> = {
  green: { background: "#dcfce7", text: "#14532d" },
  amber: { background: "#fef3c7", text: "#78350f" },
  red: { background: colors.dangerSurface, text: colors.danger },
};

type Load = { state: "loading" } | { state: "failed"; error: string } | { state: "ready" };

/** Morning check-in: three taps, then today's readiness. A new `reloadKey` reloads it. */
export function CheckinCard({ reloadKey = 0 }: { reloadKey?: number }) {
  const { api } = useSession();
  const [today, setToday] = useState<Checkin | null>(null);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const request = useRef(0);

  const fetchToday = useCallback(async () => {
    const id = ++request.current; // only the newest request may update the card
    setSaveError(null);
    try {
      const checkin = await api.getTodayCheckin();
      if (id !== request.current) return;
      setToday(checkin);
      setLoad({ state: "ready" });
    } catch (e) {
      if (id !== request.current) return;
      // After a first successful load, a failed background refresh keeps what is on screen
      // (and anything being typed) and only reports the problem.
      const message = errorMessage(e);
      setLoad((current) => (current.state === "ready" ? current : { state: "failed", error: message }));
      setSaveError((current) => current ?? message);
    }
  }, [api]);

  useEffect(() => {
    void fetchToday();
  }, [fetchToday, reloadKey]);

  let body;
  if (load.state === "loading") {
    body = <Text style={styles.muted}>Loading…</Text>;
  } else if (load.state === "failed") {
    // Never show an empty form here: saving it would overwrite a check-in we could not load.
    body = (
      <>
        <ErrorBanner message={load.error} />
        <Button variant="secondary" label="Try again" onPress={() => void fetchToday()} />
      </>
    );
  } else if (today && !editing) {
    body = <ReadinessView checkin={today} onEdit={() => setEditing(true)} />;
  } else {
    body = (
      <>
        <ErrorBanner message={saveError} />
        <CheckinForm
          initial={today}
          onSaving={() => setSaveError(null)}
          onSaved={(saved) => {
            request.current++; // a load started before the save must not undo it
            setToday(saved);
            setEditing(false);
            announce(`Readiness ${saved.readiness.score} of 100. ${READINESS_TEXT[saved.readiness.level]}`);
          }}
          onError={(message) => {
            setSaveError(message);
            announce(message);
          }}
        />
      </>
    );
  }

  return (
    <Card>
      <Text accessibilityRole="header" style={styles.title}>
        Morning check-in
      </Text>
      {body}
    </Card>
  );
}

/** Android reads live regions by itself; iOS needs an explicit announcement. */
function announce(text: string) {
  if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(text);
}

function ReadinessView({ checkin, onEdit }: { checkin: Checkin; onEdit: () => void }) {
  const { score, level, limiting_factors } = checkin.readiness;
  const tone = LEVEL_COLORS[level];
  const limiting = limitingText(limiting_factors);
  return (
    <View style={styles.gap}>
      <View
        accessible
        accessibilityLiveRegion="polite"
        testID="readiness"
        style={[styles.traffic, { backgroundColor: tone.background }]}
      >
        <Text style={[styles.score, { color: tone.text }]}>Readiness {score}/100</Text>
        <Text style={{ color: tone.text }}>{READINESS_TEXT[level]}</Text>
      </View>
      {limiting && <Text style={styles.muted}>{limiting}</Text>}
      {checkin.pain && <Text style={styles.body}>{PAIN_NOTE}</Text>}
      <Text style={styles.small}>{READINESS_NOTE}</Text>
      <Button variant="secondary" label="Change today's answers" onPress={onEdit} />
    </View>
  );
}

function CheckinForm({
  initial,
  onSaving,
  onSaved,
  onError,
}: {
  initial: Checkin | null;
  onSaving: () => void;
  onSaved: (checkin: Checkin) => void;
  onError: (message: string) => void;
}) {
  const { api } = useSession();
  const [answers, setAnswers] = useState<Partial<Record<CheckinScale, number>>>(() =>
    initial
      ? { sleep_quality: initial.sleep_quality, soreness: initial.soreness, mood: initial.mood }
      : {},
  );
  const [sleepHours, setSleepHours] = useState(initial?.sleep_hours?.toString() ?? "");
  const [pain, setPain] = useState(initial?.pain ?? false);
  const [busy, setBusy] = useState(false);

  const hours = parseSleepHours(sleepHours);
  const complete =
    CHECKIN_QUESTIONS.every((q) => answers[q.key] !== undefined) && hours !== "invalid";

  async function submit() {
    if (hours === "invalid" || !complete || busy) return;
    const body: CheckinIn = {
      sleep_quality: answers.sleep_quality!,
      soreness: answers.soreness!,
      mood: answers.mood!,
      pain,
      ...(hours !== null ? { sleep_hours: hours } : {}),
    };
    onSaving();
    setBusy(true);
    try {
      // Editing keeps the day that was loaded; a new check-in lets the server pick today.
      const saved = initial
        ? await api.saveCheckin(initial.day, body)
        : await api.saveTodayCheckin(body);
      onSaved(saved);
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.gap}>
      {CHECKIN_QUESTIONS.map((q) => (
        <View key={q.key} style={styles.question}>
          <Text style={styles.label} importantForAccessibility="no" accessible={false}>
            {q.question}
          </Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={q.question}
            testID={`scale-${q.key}`}
            style={styles.scale}
          >
            {SCALE_VALUES.map((value) => {
              const selected = answers[q.key] === value;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  // iOS has no radio groups, so every option names its question.
                  accessibilityLabel={`${q.question} ${scaleOptionLabel(value, q)}`}
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
        {hours === "invalid" && <Text style={styles.error}>{SLEEP_HOURS_ERROR}</Text>}
      </View>
      {/* The whole row is one switch: tapping the text toggles it, and it is read once. */}
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={PAIN_LABEL}
        accessibilityState={{ checked: pain }}
        onPress={() => setPain((p) => !p)}
        style={styles.row}
      >
        <Text style={styles.rowLabel}>{PAIN_LABEL}</Text>
        <Switch
          accessible={false}
          importantForAccessibility="no"
          value={pain}
          onValueChange={setPain}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </Pressable>
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
  body: { fontSize: font.body, color: colors.text },
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
  row: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: TOUCH_TARGET },
  rowLabel: { flex: 1, fontSize: font.body, color: colors.text },
  traffic: { borderRadius: radius.sm, padding: space.md, gap: space.xs },
  score: { fontSize: font.body, fontWeight: "700" },
  muted: { fontSize: font.small, color: colors.muted },
});
