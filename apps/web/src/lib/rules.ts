/**
 * Client-side copies of backend business rules, so forms explain problems before a round trip.
 * The backend stays the source of truth (services/api/.../profile/domain.py); keep these in sync.
 */

export const MIN_AGE_YEARS = 18;
export const MAX_GOAL_HORIZON_DAYS = 3 * 365;

/** Latest birth year allowed today. Mirrors the backend's mid-year birthday assumption. */
export function maxBirthYear(today: Date = new Date()): number {
  const beforeJuly = today.getMonth() < 6; // getMonth: 0 = January
  return today.getFullYear() - MIN_AGE_YEARS - (beforeJuly ? 1 : 0);
}

/** ISO date (YYYY-MM-DD) in local time. */
export function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Earliest and latest allowed target dates: tomorrow to three years ahead. */
export function goalDateBounds(today: Date = new Date()): { min: string; max: string } {
  const min = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const max = new Date(today.getFullYear(), today.getMonth(), today.getDate() + MAX_GOAL_HORIZON_DAYS);
  return { min: isoDate(min), max: isoDate(max) };
}

/** Whole days from today until a YYYY-MM-DD date, both read as local calendar days. */
export function daysUntil(isoDay: string, today: Date = new Date()): number {
  const [y, m, d] = isoDay.split("-").map(Number);
  const target = new Date(y ?? 0, (m ?? 1) - 1, d ?? 1);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}
