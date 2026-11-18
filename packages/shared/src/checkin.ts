/** The morning check-in: questions, readiness wording and input rules. */

export type CheckinScale = "sleep_quality" | "soreness" | "mood";
export type ReadinessLevel = "green" | "amber" | "red";

/** The three morning questions, answered 1 (bad) to 5 (great). */
export const CHECKIN_QUESTIONS: readonly {
  key: CheckinScale;
  question: string;
  low: string;
  high: string;
}[] = [
  { key: "sleep_quality", question: "How did you sleep?", low: "Very badly", high: "Great" },
  { key: "soreness", question: "How do your muscles feel?", low: "Very sore", high: "Fresh" },
  { key: "mood", question: "How do you feel?", low: "Very low", high: "Great" },
];

export const SCALE_VALUES = [1, 2, 3, 4, 5] as const;

/** Accessible name of one answer, e.g. "1 of 5 (Very badly)". */
export function scaleOptionLabel(
  value: number,
  question: { low: string; high: string },
): string {
  const end = value === 1 ? ` (${question.low})` : value === 5 ? ` (${question.high})` : "";
  return `${value} of 5${end}`;
}

/** Guidance, not orders: the athlete decides. */
export const READINESS_TEXT: Record<ReadinessLevel, string> = {
  green: "Good to train as planned.",
  amber: "Consider an easier session today.",
  red: "Consider rest or light recovery today.",
};

export const READINESS_NOTE = "A training guide based on your answers, not medical advice.";

export const PAIN_NOTE =
  "You reported pain. If it does not ease, see a doctor or physio. If the pain is severe or " +
  "sudden, or you have chest pain, get medical help now.";

export const PAIN_LABEL = "I have pain today (not normal muscle soreness)";

const FACTOR_LABELS: Record<string, string> = {
  sleep: "sleep",
  soreness: "sore muscles",
  mood: "mood",
  hrv: "heart rate variability",
  resting_hr: "resting heart rate",
  training_load: "recent training load",
  pain: "pain",
};

/** "Held back by: sleep, pain." or null when nothing held readiness back. */
export function limitingText(factors: readonly string[]): string | null {
  if (factors.length === 0) return null;
  return `Held back by: ${factors.map((f) => FACTOR_LABELS[f] ?? f).join(", ")}.`;
}

export const MAX_SLEEP_HOURS = 16;
export const SLEEP_HOURS_ERROR = `Enter 0 to ${MAX_SLEEP_HOURS} hours.`;

/**
 * Parses the optional sleep-hours field. Accepts "7.5" and "7,5". Returns null for an empty
 * field, a number for a valid value, and "invalid" otherwise.
 */
export function parseSleepHours(input: string): number | null | "invalid" {
  const text = input.trim();
  if (!text) return null;
  if (!/^\d+([.,]\d+)?$/.test(text)) return "invalid";
  const hours = Number(text.replace(",", "."));
  return hours <= MAX_SLEEP_HOURS ? hours : "invalid";
}
