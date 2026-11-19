import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";

import { HealthSync, phoneHealthSource, type SyncOutcome, type SyncState } from "../health/sync";
import type { Availability, HealthSource } from "../health/types";
import { errorMessage, useSession } from "../lib/session";
import { colors, font, space } from "../theme";
import { Button, Card, ErrorBanner } from "./ui";

const STORE_NAME = { apple_health: "Apple Health", health_connect: "Health Connect" } as const;

type View_ =
  | { kind: "loading" }
  | { kind: "unavailable" | "update_required" }
  | { kind: "disconnected" }
  | { kind: "connected"; lastSync: string | null };

function summary(outcome: SyncOutcome): string {
  const added = outcome.created === 1 ? "1 new workout" : `${outcome.created} new workouts`;
  const parts = [added];
  if (outcome.updated) parts.push(`${outcome.updated} updated`);
  if (outcome.skipped) parts.push(`${outcome.skipped} skipped (incomplete data)`);
  return `${parts.join(", ")}.`;
}

/**
 * Connects the phone's health store and syncs workouts in the foreground. `source` and `state`
 * are for tests; the app uses the store of this phone and AsyncStorage.
 */
export function HealthSyncCard({
  source: injected,
  state,
}: {
  source?: HealthSource | null;
  state?: SyncState;
}) {
  const { api } = useSession();
  // Built once: a new source on every render would restart the sync effect in a loop.
  const source = useMemo(
    () => (injected === undefined ? phoneHealthSource() : injected),
    [injected],
  );
  const sync = useMemo(
    () => (source ? new HealthSync(source, api, state) : null),
    [source, api, state],
  );
  const [view, setView] = useState<View_>({ kind: "loading" });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const runSync = useCallback(async () => {
    if (!sync) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await sync.sync();
      setMessage(summary(outcome));
      setView({ kind: "connected", lastSync: outcome.syncedAt });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [sync]);

  useEffect(() => {
    if (!sync) {
      setView({ kind: "unavailable" });
      return;
    }
    let active = true;
    (async () => {
      const availability: Availability = await sync.source.availability();
      if (!active) return;
      if (availability !== "available") return setView({ kind: availability });
      if (await sync.isConnected()) {
        setView({ kind: "connected", lastSync: await sync.lastSync() });
        void runSync();
      } else {
        setView({ kind: "disconnected" });
      }
    })().catch(() => active && setView({ kind: "unavailable" }));
    return () => {
      active = false;
    };
  }, [sync, runSync]);

  // Sync again whenever the app comes back to the foreground.
  useEffect(() => {
    if (view.kind !== "connected") return;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void runSync();
    });
    return () => subscription.remove();
  }, [view.kind, runSync]);

  if (view.kind === "loading") return null;
  const store = source ? STORE_NAME[source.platform] : "your health app";

  return (
    <Card>
      <Text accessibilityRole="header" style={styles.title}>
        Workouts from your watch
      </Text>
      <ErrorBanner message={error} />
      {view.kind === "unavailable" && (
        <Text style={styles.body}>
          Syncing needs the installed Buddy Coach app (not Expo Go) on a phone with {store}.
        </Text>
      )}
      {view.kind === "update_required" && (
        <Text style={styles.body}>Update Health Connect in Google Play, then come back.</Text>
      )}
      {view.kind === "disconnected" && (
        <>
          <Text style={styles.body}>
            Buddy Coach reads your workouts and heart rate from {store} (read only) to calculate
            your training load. Garmin, Fitbit, Samsung, Xiaomi, WHOOP and other apps that write
            there are included.
          </Text>
          <Button
            label={`Connect ${store}`}
            busy={busy}
            onPress={() => {
              if (!sync) return;
              setError(null);
              setBusy(true); // one permission request at a time
              sync
                .connect()
                .then((granted) => {
                  setBusy(false);
                  if (!granted) return setError(`${store} access was not granted.`);
                  setView({ kind: "connected", lastSync: null });
                  return runSync();
                })
                .catch((e: unknown) => {
                  setBusy(false);
                  setError(errorMessage(e));
                });
            }}
          />
        </>
      )}
      {view.kind === "connected" && (
        <>
          <View accessible accessibilityLiveRegion="polite">
            {message && <Text style={styles.body}>{message}</Text>}
            <Text style={styles.small}>
              {view.lastSync
                ? `Last synced ${new Date(view.lastSync).toLocaleString()}`
                : "Not synced yet"}
              {source?.platform === "apple_health"
                ? ". No workouts? Check that Buddy Coach may read them in the Health app."
                : ""}
            </Text>
          </View>
          <Button label="Sync now" busy={busy} onPress={() => void runSync()} />
          <Button
            variant="secondary"
            label={`Stop syncing ${store}`}
            disabled={busy}
            onPress={() => {
              sync
                ?.disconnect()
                .then(() => {
                  setMessage(null);
                  setView({ kind: "disconnected" });
                })
                .catch((e: unknown) => setError(errorMessage(e)));
            }}
          />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.title, fontWeight: "600", color: colors.text },
  body: { fontSize: font.body, color: colors.text },
  small: { fontSize: font.small, color: colors.muted, marginTop: space.xs },
});
