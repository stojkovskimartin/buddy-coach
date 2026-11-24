import type { Goal, Profile } from "@buddy/api-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { CheckinCard } from "../components/CheckinCard";
import { HealthSyncCard } from "../components/HealthSyncCard";
import { PhotoStrip } from "../components/PhotoStrip";
import { TargetsCard } from "../components/TargetsCard";
import { WeightCard } from "../components/WeightCard";
import { Button, Card, ErrorBanner } from "../components/ui";
import { useI18n } from "../i18n";
import { LanguageSwitch } from "../i18n/LanguageSwitch";
import { errorMessage, useSession } from "../lib/session";
import { colors, font, space } from "../theme";

/** Whole days from today to an ISO date (negative when it is in the past). */
export function daysUntil(isoDate: string, today: Date = new Date()): number {
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, m, d] = isoDate.split("-").map(Number);
  return Math.round((Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) - start) / 86_400_000);
}

/** `active` is true while the Today tab is shown; data reloads each time it becomes active. */
export function HomeScreen({ onOpenCoach, active = true }: { onOpenCoach: () => void; active?: boolean }) {
  const { api, logout } = useSession();
  const { t } = useI18n();
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
        {t.home.title}
      </Text>
      <ErrorBanner message={error} />
      <CheckinCard reloadKey={reloads} />
      {profile && <TargetsCard reloadKey={reloads} />}
      <WeightCard reloadKey={reloads} />
      <HealthSyncCard onNewWeights={reload} />
      {!loading && !error && !profile && (
        <Card>
          <Text style={styles.heading}>{t.home.setUp}</Text>
          <Text style={styles.body}>{t.home.setUpText}</Text>
        </Card>
      )}
      {primary && (
        <Card>
          <Text style={styles.label}>{t.home.mainGoal}</Text>
          <Text style={styles.heading}>{primary.title}</Text>
          <Text style={styles.body}>{t.home.goalTypes[primary.goal_type]}</Text>
          {primary.target_date && <Countdown date={primary.target_date} />}
        </Card>
      )}
      {goals
        .filter((g) => g !== primary)
        .map((g) => (
          <Card key={g.id}>
            <Text style={styles.label}>{t.home.otherGoal}</Text>
            <Text style={styles.heading}>{g.title}</Text>
          </Card>
        ))}
      {!loading && !error && profile && goals.length === 0 && (
        <Text style={styles.body}>{t.home.noGoal}</Text>
      )}
      {profile && (
        <Card>
          <Text accessibilityRole="header" style={styles.heading}>
            {t.home.profilePicture}
          </Text>
          <PhotoStrip kind="avatar" title={t.home.profilePicture} one={t.home.onePicture} reloadKey={reloads} />
        </Card>
      )}
      <Button label={t.home.askCoach} onPress={onOpenCoach} />
      <Button variant="secondary" label={t.home.logout} onPress={() => void logout()} />
      <LanguageSwitch />
    </ScrollView>
  );
}

function Countdown({ date }: { date: string }) {
  const { t } = useI18n();
  const days = daysUntil(date);
  const text =
    days > 1
      ? t.home.daysToGo(days)
      : days === 1
        ? t.home.tomorrow
        : days === 0
          ? t.home.dayIsHere
          : t.home.datePassed;
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
