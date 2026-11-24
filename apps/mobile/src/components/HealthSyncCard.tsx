import { INTL_LOCALE, type SharedText } from "@buddy/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";

import { HealthSync, phoneHealthSource, type SyncOutcome, type SyncState } from "../health/sync";
import type { Availability, HealthSource } from "../health/types";
import { useI18n } from "../i18n";
import type { Messages } from "../i18n/messages";
import { errorMessage, useSession } from "../lib/session";
import { colors, font, space } from "../theme";
import { Button, Card, ErrorBanner } from "./ui";

const STORE_NAME = { apple_health: "Apple Health", health_connect: "Health Connect" } as const;

type View_ =
  | { kind: "loading" }
  | { kind: "unavailable" | "update_required" }
  | { kind: "disconnected" }
  | { kind: "connected"; lastSync: string | null };

function summary(outcome: SyncOutcome, t: Messages, s: SharedText): string {
  const parts = [s.importText(outcome)];
  if (outcome.skipped) parts.push(t.health.skipped(outcome.skipped));
  if (outcome.weights) parts.push(t.health.newWeights(outcome.weights));
  return `${parts.join(", ")}.`;
}

/**
 * Connects the phone's health store and syncs workouts and smart-scale weights in the foreground.
 * `onNewWeights` lets the screen refresh what depends on the weight. `source` and `state` are for
 * tests; the app uses the store of this phone and AsyncStorage.
 */
export function HealthSyncCard({
  source: injected,
  state,
  onNewWeights,
}: {
  source?: HealthSource | null;
  state?: SyncState;
  onNewWeights?: () => void;
}) {
  const { api } = useSession();
  const { locale, t, s } = useI18n();
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
  const [outcome, setOutcome] = useState<SyncOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsWeight, setNeedsWeight] = useState(false);

  // In a ref: a new callback from the screen must not restart the sync effect below.
  const newWeights = useRef(onNewWeights);
  newWeights.current = onNewWeights;

  const runSync = useCallback(async () => {
    if (!sync) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await sync.sync();
      setOutcome(outcome);
      if (outcome.weights) newWeights.current?.();
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
        const missing = await sync.source.needsWeightAccess();
        if (active) setNeedsWeight(missing);
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
  const store = source ? STORE_NAME[source.platform] : t.health.yourApp;

  return (
    <Card>
      <Text accessibilityRole="header" style={styles.title}>
        {t.health.title}
      </Text>
      <ErrorBanner message={error} />
      {view.kind === "unavailable" && (
        <Text style={styles.body}>{t.health.unavailable(store)}</Text>
      )}
      {view.kind === "update_required" && (
        <Text style={styles.body}>{t.health.updateRequired}</Text>
      )}
      {view.kind === "disconnected" && (
        <>
          <Text style={styles.body}>{t.health.intro(store)}</Text>
          <Button
            label={t.health.connect(store)}
            busy={busy}
            onPress={() => {
              if (!sync) return;
              setError(null);
              setBusy(true); // one permission request at a time
              sync
                .connect()
                .then((granted) => {
                  setBusy(false);
                  if (!granted) return setError(t.health.notGranted(store));
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
            {outcome && <Text style={styles.body}>{summary(outcome, t, s)}</Text>}
            <Text style={styles.small}>
              {view.lastSync
                ? t.health.lastSynced(new Date(view.lastSync).toLocaleString(INTL_LOCALE[locale]))
                : t.health.notSynced}
              {source?.platform === "apple_health" ? t.health.appleHint : ""}
            </Text>
          </View>
          {needsWeight && (
            <>
              <Text style={styles.body}>{t.health.needsWeight(store)}</Text>
              <Button
                variant="secondary"
                label={t.health.allowWeight}
                disabled={busy}
                onPress={() => {
                  if (!sync) return;
                  setError(null);
                  sync
                    .connect() // asks only for what is still missing
                    .then(async () => {
                      setNeedsWeight(await sync.source.needsWeightAccess());
                      return runSync();
                    })
                    .catch((e: unknown) => setError(errorMessage(e)));
                }}
              />
            </>
          )}
          <Button label={t.health.syncNow} busy={busy} onPress={() => void runSync()} />
          <Button
            variant="secondary"
            label={t.health.stop(store)}
            disabled={busy}
            onPress={() => {
              sync
                ?.disconnect()
                .then(() => {
                  setOutcome(null);
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
