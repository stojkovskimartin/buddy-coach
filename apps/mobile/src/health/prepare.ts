/**
 * Makes store records safe to send: the server refuses a whole batch for one bad workout, so
 * impossible values are dropped or cleared here, with the same limits as the API.
 */
import type { ImportedWorkout } from "@buddy/api-client";

import type { HealthPlatform, RawWorkout } from "./types";

export const MAX_BATCH = 500;
const FUTURE_TOLERANCE_MS = 60 * 60 * 1000;

function within(value: number | null | undefined, min: number, max: number): number | null {
  return value != null && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

/** null when the workout cannot be sent at all (no duration, too long, in the future). */
export function prepareWorkout(
  raw: RawWorkout,
  source: HealthPlatform,
  now: Date,
): ImportedWorkout | null {
  const start = new Date(raw.started_at);
  if (Number.isNaN(start.getTime()) || start.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    return null;
  }
  // Rounded first: a 2-second accidental start would otherwise round to 0 and be refused.
  const duration = Math.round(raw.duration_min * 10) / 10;
  if (!(duration > 0 && duration <= 1440)) return null;
  let avgHr = within(raw.avg_hr, 30, 230);
  let maxHr = within(raw.max_hr, 30, 240);
  if (avgHr !== null && maxHr !== null && maxHr < avgHr) {
    avgHr = null;
    maxHr = null;
  }
  return {
    source,
    external_id: raw.external_id,
    activity: raw.activity,
    started_at: start.toISOString(),
    duration_min: duration,
    distance_km: within(raw.distance_km, 0, 1000),
    elevation_gain_m: within(raw.elevation_gain_m, 0, 10000),
    avg_hr: avgHr,
    max_hr: maxHr,
    kcal: within(raw.kcal, 0, 20000),
  };
}

export function chunk<T>(items: T[], size: number = MAX_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
