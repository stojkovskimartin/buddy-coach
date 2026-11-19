/**
 * The phone's health store (Apple Health or Health Connect) behind one small interface, so the
 * sync logic is the same on both platforms and tests never load native code.
 */
import type { ImportedWorkout } from "@buddy/api-client";

export type HealthPlatform = "apple_health" | "health_connect";

export type Availability = "available" | "update_required" | "unavailable";

/** A workout read from the store, in the server's import format, before validation. */
export type RawWorkout = Omit<ImportedWorkout, "source">;

export interface ReadResult {
  workouts: RawWorkout[];
  /** Opaque position in the store's change feed; save it only after the server accepted the batch. */
  nextCursor: string | null;
}

export interface HealthSource {
  readonly platform: HealthPlatform;
  availability(): Promise<Availability>;
  /** Asks for read access to workouts and heart rate. Resolves false when the user declines. */
  connect(): Promise<boolean>;
  /** Workouts changed since `cursor`; with no cursor, those that started after `since`. */
  readSince(cursor: string | null, since: Date): Promise<ReadResult>;
}
