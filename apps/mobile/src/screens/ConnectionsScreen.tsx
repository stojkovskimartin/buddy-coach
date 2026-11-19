import type {
  IntegrationProvider,
  ProviderStatus,
  WeightSourceSummary,
  WorkoutSourceSummary,
} from "@buddy/api-client";
import { WEIGHT_SOURCE_LABEL, syncText } from "@buddy/shared";
import { useCallback, useEffect, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { Button, Card, ErrorBanner, InfoBanner } from "../components/ui";
import { errorMessage, useSession } from "../lib/session";
import { colors, font, space } from "../theme";

const PROVIDER: Record<IntegrationProvider, { name: string; what: string; data: "weight" | "workout" }> = {
  withings: { name: "Withings", what: "weight from Withings smart scales", data: "weight" },
  whoop: { name: "WHOOP", what: "workouts from WHOOP", data: "workout" },
};

const SOURCE_LABEL: Record<WorkoutSourceSummary["source"], string> = {
  ...WEIGHT_SOURCE_LABEL,
  manual: "Typed in",
  fit_file: "Watch files",
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

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

/** Where the data comes from: the phone's health app, connected accounts, files and typed-in
 * entries, with sync and disconnect for accounts. Loads each time the tab is shown. */
export function ConnectionsScreen({ active = true }: { active?: boolean }) {
  const { api } = useSession();
  const [workouts, setWorkouts] = useState<WorkoutSourceSummary[]>([]);
  const [weights, setWeights] = useState<WeightSourceSummary[]>([]);
  const [accounts, setAccounts] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
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
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (action === "sync") setMessage(`${syncText(await api.syncIntegration(provider), PROVIDER[provider].data)}.`);
      else await api.disconnectIntegration(provider);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const disconnect = (provider: IntegrationProvider) =>
    Alert.alert(`Disconnect ${PROVIDER[provider].name}?`, "Data already brought in stays.", [
      { text: "Cancel", style: "cancel" },
      { text: "Disconnect", style: "destructive", onPress: () => void act(provider, "disconnect") },
    ]);

  const sources = [
    ...workouts.map((w) => ({ key: `w-${w.source}`, label: SOURCE_LABEL[w.source], text: `${w.workouts} ${w.workouts === 1 ? "workout" : "workouts"}, latest ${when(w.last_at)}` })),
    ...weights.map((w) => ({ key: `k-${w.source}`, label: WEIGHT_SOURCE_LABEL[w.source], text: `${w.weights} ${w.weights === 1 ? "weight" : "weights"}, latest ${when(w.last_at)}` })),
  ];

  return (
    <ScrollView
      contentContainerStyle={styles.screen}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
    >
      <Text accessibilityRole="header" style={styles.title}>
        Connections
      </Text>
      <ErrorBanner message={error} />
      <InfoBanner message={message} />
      <Card>
        <Text accessibilityRole="header" style={styles.heading}>
          Accounts
        </Text>
        <Text style={styles.muted}>
          Connecting an account opens its sign-in page, so it is done once in the web app on a computer
          (Connections → Accounts). Here you can sync or disconnect it. If that app already sends the same data
          to Apple Health or Health Connect, use one of the two, or everything shows up twice.
        </Text>
        {accounts.map((a) => (
          <View key={a.provider} style={styles.account}>
            <Text style={styles.body}>
              <Text style={styles.strong}>{PROVIDER[a.provider].name}</Text> · {PROVIDER[a.provider].what}
            </Text>
            <Text style={styles.muted}>
              {a.connected
                ? a.last_sync_at
                  ? `Connected, last sync ${when(a.last_sync_at)}`
                  : "Connected"
                : a.available
                  ? "Not connected"
                  : "Not set up on this server yet"}
            </Text>
            {a.connected && (
              <>
                <Button
                  label={`Sync ${PROVIDER[a.provider].name} now`}
                  busy={busy}
                  onPress={() => void act(a.provider, "sync")}
                />
                <Button
                  variant="secondary"
                  label={`Disconnect ${PROVIDER[a.provider].name}`}
                  disabled={busy}
                  onPress={() => disconnect(a.provider)}
                />
              </>
            )}
          </View>
        ))}
      </Card>
      <Card>
        <Text accessibilityRole="header" style={styles.heading}>
          Data so far
        </Text>
        {sources.length === 0 && (
          <Text style={styles.muted}>Nothing yet. Connect your watch or scale on Today, or an account above.</Text>
        )}
        {sources.map((s) => (
          <Text key={s.key} style={styles.body}>
            <Text style={styles.strong}>{s.label}</Text> <Text style={styles.muted}>· {s.text}</Text>
          </Text>
        ))}
        <Text style={styles.muted}>
          Watches and smart scales sync through the phone's health app on Today. Watch files (.fit) are uploaded in
          the web app.
        </Text>
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
