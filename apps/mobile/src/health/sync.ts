/**
 * Phone health store → POST /workouts/import. Runs in the foreground (on "Sync now" and when the
 * app becomes active); one sync at a time; the store's cursor is saved only after the server
 * accepted every batch, so a failed sync is simply repeated. Workouts are never stored on the
 * phone: only the cursor, the connected flag and the last sync time.
 */
import type { ImportedWorkout, ImportResult } from "@buddy/api-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { appleHealthSource } from "./appleHealth";
import { healthConnectSource } from "./healthConnect";
import { chunk, prepareWorkout } from "./prepare";
import type { HealthPlatform, HealthSource } from "./types";

/** Health Connect cannot read further back than 30 days before access was granted. */
export const FIRST_SYNC_DAYS = 30;

export interface SyncApi {
  importWorkouts(workouts: ImportedWorkout[]): Promise<ImportResult>;
}

export interface SyncState {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface SyncOutcome {
  created: number;
  updated: number;
  skipped: number;
  syncedAt: string;
}

const key = (platform: HealthPlatform, name: "cursor" | "connected" | "last_sync") =>
  `buddy-coach.health.${platform}.${name}`;

export const asyncStorageState: SyncState = {
  get: (k) => AsyncStorage.getItem(k),
  set: (k, v) => AsyncStorage.setItem(k, v),
  remove: (k) => AsyncStorage.removeItem(k),
};

/** The store of this phone, or null on other platforms. */
export function phoneHealthSource(os: string = Platform.OS): HealthSource | null {
  if (os === "ios") return appleHealthSource();
  if (os === "android") return healthConnectSource();
  return null;
}

export class HealthSync {
  private running: Promise<SyncOutcome> | null = null;

  constructor(
    readonly source: HealthSource,
    private readonly api: SyncApi,
    private readonly state: SyncState = asyncStorageState,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async isConnected(): Promise<boolean> {
    return (await this.state.get(key(this.source.platform, "connected"))) === "true";
  }

  async lastSync(): Promise<string | null> {
    return this.state.get(key(this.source.platform, "last_sync"));
  }

  /** Asks for access; on success the first sync runs right away. */
  async connect(): Promise<boolean> {
    const granted = await this.source.connect();
    if (granted) await this.state.set(key(this.source.platform, "connected"), "true");
    return granted;
  }

  /** Stops syncing here. Access itself is withdrawn in the phone's health settings. */
  async disconnect(): Promise<void> {
    await this.running?.catch(() => undefined); // a running sync must not write after this
    const platform = this.source.platform;
    await Promise.all([
      this.state.remove(key(platform, "connected")),
      this.state.remove(key(platform, "cursor")),
      this.state.remove(key(platform, "last_sync")),
    ]);
  }

  /** One sync at a time: a second call while one runs gets the same result. */
  sync(): Promise<SyncOutcome> {
    this.running ??= this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(): Promise<SyncOutcome> {
    const platform = this.source.platform;
    const now = this.now();
    const cursor = await this.state.get(key(platform, "cursor"));
    const since = new Date(now.getTime() - FIRST_SYNC_DAYS * 86_400_000);
    const { workouts, nextCursor } = await this.source.readSince(cursor, since);

    const ready = workouts
      .map((w) => prepareWorkout(w, platform, now))
      .filter((w): w is ImportedWorkout => w !== null);
    let created = 0;
    let updated = 0;
    for (const batch of chunk(ready)) {
      const result = await this.api.importWorkouts(batch);
      created += result.created;
      updated += result.updated;
    }
    if (nextCursor) await this.state.set(key(platform, "cursor"), nextCursor);
    const syncedAt = this.now().toISOString();
    await this.state.set(key(platform, "last_sync"), syncedAt);
    return { created, updated, skipped: workouts.length - ready.length, syncedAt };
  }
}
