import type {
  IntegrationProvider,
  ProviderStatus,
  WeightSourceSummary,
  WorkoutSourceSummary,
} from "@buddy/api-client";
import { INTL_LOCALE, type SharedText } from "@buddy/shared";
import { useCallback, useEffect, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { Button, Card, ErrorBanner, InfoBanner } from "../components/ui";
import { useI18n } from "../i18n";
import { errorMessage, useSession } from "../lib/session";
import { colors, font, space } from "../theme";

const PROVIDER: Record<IntegrationProvider, { name: string; data: "weight" | "workout" }> = {
  withings: { name: "Withings", data: "weight" },
  whoop: { name: "WHOOP", data: "workout" },
};

/** Brand names; the rest comes in the user's language. */
const BRANDS: Omit<Record<WorkoutSourceSummary["source"], string>, keyof SharedText["weightSourceLabel"] | "fit_file"> = {
  garmin: "Garmin",
  fitbit: "Fitbit",
  whoop: "WHOOP",
  polar: "Polar",
  suunto: "Suunto",
  coros: "Coros",
  huawei: "Huawei",
  xiaomi: "Xiaomi",
  strava: "Strava",
};

/** Where the data comes from: the phone's health app, connected accounts, files and typed-in
 * entries, with sync and disconnect for accounts. Loads each time the tab is shown. */
export function ConnectionsScreen({ active = true }: { active?: boolean }) {
  const { api } = useSession();
  const { locale, t, s } = useI18n();
  const when = (iso: string) =>
    new Date(iso).toLocaleString(INTL_LOCALE[locale], { dateStyle: "medium", timeStyle: "short" });
  const sourceLabel: Record<WorkoutSourceSummary["source"], string> = {
    ...s.weightSourceLabel,
    ...BRANDS,
    fit_file: t.connections.watchFiles,
  };
  const [workouts, setWorkouts] = useState<WorkoutSourceSummary[]>([]);
  const [weights, setWeights] = useState<WeightSourceSummary[]>([]);
  const [accounts, setAccounts] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<IntegrationProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, s, a] = await Promise.all([api.workoutSources(), api.weightSources(), api.integrations()]);
      setWorkouts(w);
      setWeights(s);
      setAccounts(a);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  async function act(provider: IntegrationProvider, action: "sync" | "disconnect") {
    setBusy(provider);
    setError(null);
    setMessage(null);
    try {
      if (action === "sync") setMessage(`${s.syncText(await api.syncIntegration(provider), PROVIDER[provider].data)}.`);
      else await api.disconnectIntegration(provider);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const disconnect = (provider: IntegrationProvider) =>
    Alert.alert(t.connections.confirmDisconnect(PROVIDER[provider].name), t.connections.dataStays, [
      { text: t.cancel, style: "cancel" },
      { text: t.connections.disconnectButton, style: "destructive", onPress: () => void act(provider, "disconnect") },
    ]);

  const sources = [
    ...workouts.map((w) => ({
      key: `w-${w.source}`,
      label: sourceLabel[w.source],
      text: t.connections.workouts(w.workouts, when(w.last_at)),
    })),
    ...weights.map((w) => ({
      key: `k-${w.source}`,
      label: s.weightSourceLabel[w.source],
      text: t.connections.weights(w.weights, when(w.last_at)),
    })),
  ];

  return (
    <ScrollView
      contentContainerStyle={styles.screen}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
    >
      <Text accessibilityRole="header" style={styles.title}>
        {t.connections.title}
      </Text>
      <ErrorBanner message={error} />
      <InfoBanner message={message} />
      <Card>
        <Text accessibilityRole="header" style={styles.heading}>
          {t.connections.accounts}
        </Text>
        <Text style={styles.muted}>{t.connections.accountsText}</Text>
        {accounts.map((a) => (
          <View key={a.provider} style={styles.account}>
            <Text style={styles.body}>
              <Text style={styles.strong}>{PROVIDER[a.provider].name}</Text> · {t.connections.what[a.provider]}
            </Text>
            <Text style={styles.muted}>
              {a.connected
                ? a.last_sync_at
                  ? t.connections.connectedSynced(when(a.last_sync_at))
                  : t.connections.connected
                : a.available
                  ? t.connections.notConnected
                  : t.connections.notSetUp}
            </Text>
            {a.connected && (
              <>
                <Button
                  label={t.connections.sync(PROVIDER[a.provider].name)}
                  busy={busy === a.provider}
                  disabled={busy !== null}
                  onPress={() => void act(a.provider, "sync")}
                />
                <Button
                  variant="secondary"
                  label={t.connections.disconnect(PROVIDER[a.provider].name)}
                  disabled={busy !== null}
                  onPress={() => disconnect(a.provider)}
                />
              </>
            )}
          </View>
        ))}
      </Card>
      <Card>
        <Text accessibilityRole="header" style={styles.heading}>
          {t.connections.dataSoFar}
        </Text>
        {sources.length === 0 && <Text style={styles.muted}>{t.connections.nothingYet}</Text>}
        {sources.map((s) => (
          <Text key={s.key} style={styles.body}>
            <Text style={styles.strong}>{s.label}</Text> <Text style={styles.muted}>· {s.text}</Text>
          </Text>
        ))}
        <Text style={styles.muted}>{t.connections.footer}</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space.lg, gap: space.lg, backgroundColor: colors.background },
  title: { fontSize: font.heading, fontWeight: "700", color: colors.text },
  heading: { fontSize: font.title, fontWeight: "600", color: colors.text },
  body: { fontSize: font.body, color: colors.text },
  strong: { fontWeight: "700" },
  muted: { fontSize: font.small, color: colors.muted },
  account: { gap: space.sm },
});
