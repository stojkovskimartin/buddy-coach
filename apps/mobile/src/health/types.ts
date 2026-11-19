/**
 * The phone's health store (Apple Health or Health Connect) behind one small interface, so the
 * sync logic is the same on both platforms and tests never load native code.
 */
import type { ImportedWeight, ImportedWorkout } from "@buddy/api-client";

export type HealthPlatform = "apple_health" | "health_connect";

export type Availability = "available" | "update_required" | "unavailable";

/** A workout read from the store, in the server's import format, before validation. */
export type RawWorkout = Omit<ImportedWorkout, "source">;

/** A body-weight reading (e.g. from a smart scale), in the server's import format. */
export type RawWeight = Omit<ImportedWeight, "source">;

export interface ReadResult {
  workouts: RawWorkout[];
  /** Opaque position in the store's change feed; save it only after the server accepted the batch. */
  nextCursor: string | null;
}

export interface WeightReadResult {
  weights: RawWeight[];
  nextCursor: string | null;
}

export interface HealthSource {
  readonly platform: HealthPlatform;
  availability(): Promise<Availability>;
  /** Asks for read access to workouts, heart rate and body weight. Resolves false when the user
   * declines workouts. */
  connect(): Promise<boolean>;
  /** Workouts changed since `cursor`; with no cursor, those that started after `since`. */
  readSince(cursor: string | null, since: Date): Promise<ReadResult>;
  /** True when weight access was never asked for (connected before weights were read), so the
   * app offers to ask; `connect()` then asks only for what is missing. */
  needsWeightAccess(): Promise<boolean>;
  /** Weights changed since `cursor` (smart scales write them to the store); with no cursor, those
   * measured after `since`. Without weight access the result is empty. */
  readWeightsSince(cursor: string | null, since: Date): Promise<WeightReadResult>;
}
