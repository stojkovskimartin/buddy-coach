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

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** "12 days logged · on average 2310 kcal and 140 g protein (today's target: …)". */
export function foodSummary(
  days: readonly { kcal: number; protein_g: number }[],
  target: { kcal: number; protein_g: number } | null,
): string {
  const goal = target ? ` (today's target: ${target.kcal} kcal, ${target.protein_g} g protein)` : "";
  return `${plural(days.length, "day")} logged · on average ${average(days.map((d) => d.kcal))} kcal and ${average(
    days.map((d) => d.protein_g),
  )} g protein${goal}`;
}

/** "Fitness 42 · fatigue 55 · form -13 · load ratio 1.2". */
export function trainingSummary(
  today: { fitness: number; fatigue: number; form: number },
  ratio: number | null,
): string {
  const load = ratio !== null ? ` · load ratio ${ratio}` : "";
  return `Fitness ${today.fitness} · fatigue ${today.fatigue} · form ${today.form}${load}`;
}

/** "8 check-ins · on average 74 of 100", noting when a long period shows only recent ones. */
export function readinessSummary(scores: readonly number[], days: number): string {
  const recent = days > CHECKIN_RANGE_DAYS ? ` (last ${CHECKIN_RANGE_DAYS} days)` : "";
  return `${plural(scores.length, "check-in")} · on average ${average(scores)} of 100${recent}`;
}
