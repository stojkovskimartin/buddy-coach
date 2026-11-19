/** Ranges and summaries for the progress page. */

export const PROGRESS_RANGES = [
  { days: 28, label: "4 weeks" },
  { days: 90, label: "3 months" },
  { days: 365, label: "1 year" },
] as const;

/** Check-ins can be read for at most 92 days at a time. */
export const CHECKIN_RANGE_DAYS = 92;

/** ISO day `days` before an ISO day. */
export function daysBefore(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
}

/** Today in this device's time zone as an ISO day. */
export function localToday(now: Date = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Mean of the values, rounded; null without values. */
export function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}
