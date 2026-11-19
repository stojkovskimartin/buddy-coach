import type { Goal, Profile } from "@buddy/api-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { CheckinCard } from "../components/CheckinCard";
import { HealthSyncCard } from "../components/HealthSyncCard";
import { TargetsCard } from "../components/TargetsCard";
import { Button, Card, ErrorBanner } from "../components/ui";
import { errorMessage, useSession } from "../lib/session";
import { colors, font, space } from "../theme";

export const GOAL_LABELS: Record<Goal["goal_type"], string> = {
  lose_weight: "Lose weight",
  gain_weight: "Gain weight",
  maintain_weight: "Maintain weight",
  recomposition: "Recomposition",
  endurance_event: "Endurance event",
  mountain_sport: "Mountain sport",
  strength: "Strength",
  general_fitness: "General fitness",
};

/** Whole days from today to an ISO date (negative when it is in the past). */
export function daysUntil(isoDate: string, today: Date = new Date()): number {
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, m, d] = isoDate.split("-").map(Number);
  return Math.round((Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) - start) / 86_400_000);
}

/** `active` is true while the Today tab is shown; data reloads each time it becomes active. */
export function HomeScreen({ onOpenCoach, active = true }: { onOpenCoach: () => void; active?: boolean }) {
  const { api, logout } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, g] = await Promise.all([api.getProfile(), api.listGoals("active")]);
      setProfile(p);
      setGoals(g);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [api]);

  /** Reload goals and the cards (pull to refresh, tab shown again). */
  const reload = useCallback(() => {
    setReloads((n) => n + 1);
    void load();
  }, [load]);

  // First show loads once (the card loads itself); showing the tab again reloads everything.
  const shown = useRef(false);
  useEffect(() => {
    if (!active) return;
    if (shown.current) reload();
    else void load();
    shown.current = true;
  }, [active, load, reload]);

  const primary = goals.find((g) => g.priority === "primary");

  return (
    <ScrollView
      contentContainerStyle={styles.screen}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
    >
      <Text accessibilityRole="header" style={styles.title}>
        Today
      </Text>
      <ErrorBanner message={error} />
      <CheckinCard reloadKey={reloads} />
      {profile && <TargetsCard reloadKey={reloads} />}
      <HealthSyncCard />
      {!loading && !error && !profile && (
        <Card>
          <Text style={styles.heading}>Set up your profile</Text>
          <Text style={styles.body}>
            Your coach needs your body data and weekly time to calculate targets. Complete the
            setup in the web app for now; the guided setup on the phone comes next.
          </Text>
        </Card>
      )}
      {primary && (
        <Card>
          <Text style={styles.label}>Main goal</Text>
          <Text style={styles.heading}>{primary.title}</Text>
          <Text style={styles.body}>{GOAL_LABELS[primary.goal_type]}</Text>
          {primary.target_date && <Countdown date={primary.target_date} />}
        </Card>
      )}
      {goals
        .filter((g) => g !== primary)
        .map((g) => (
          <Card key={g.id}>
            <Text style={styles.label}>Other goal</Text>
            <Text style={styles.heading}>{g.title}</Text>
          </Card>
        ))}
      {!loading && !error && profile && goals.length === 0 && (
        <Text style={styles.body}>No active goal yet. Add one in the web app.</Text>
      )}
      <Button label="Ask your coach" onPress={onOpenCoach} />
      <Button variant="secondary" label="Log out" onPress={() => void logout()} />
    </ScrollView>
  );
}

function Countdown({ date }: { date: string }) {
  const days = daysUntil(date);
  const text =
    days > 1 ? `${days} days to go` : days === 1 ? "Tomorrow" : days === 0 ? "Today is the day" : "Date passed";
  return (
    <View style={styles.countdown}>
      <Text style={styles.countdownText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space.lg, gap: space.lg, backgroundColor: colors.background },
  title: { fontSize: font.heading, fontWeight: "700", color: colors.text },
  heading: { fontSize: font.title, fontWeight: "600", color: colors.text },
  label: { fontSize: font.small, color: colors.muted, textTransform: "uppercase" },
  body: { fontSize: font.body, color: colors.text },
  countdown: { alignSelf: "flex-start" },
  countdownText: { color: colors.primary, fontWeight: "700", fontSize: font.body },
});
