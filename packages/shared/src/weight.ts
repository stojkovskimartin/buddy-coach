/** Wording for body weight. */

export const WEIGHT_EMPTY_TEXT =
  "Log your weight, or connect a smart scale through Apple Health or Health Connect.";

export const WEIGHT_INPUT_ERROR = "Enter a weight between 30 and 300 kg.";

/** "77.4" or "77,4" → 77.4; null when it is not a plausible adult weight. */
export function parseWeightKg(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+([.,]\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed.replace(",", "."));
  if (value < 30 || value > 300) return null;
  return Math.round(value * 10) / 10;
}

function shortDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** How the trend moved over the period shown, e.g. "−1.2 kg since Aug 21". */
export function trendChangeText(trend: readonly { day: string; weight_kg: number }[]): string | null {
  if (trend.length < 2) return null;
  const first = trend[0]!;
  const change = Math.round((trend[trend.length - 1]!.weight_kg - first.weight_kg) * 10) / 10;
  if (change === 0) return `Steady since ${shortDate(first.day)}`;
  const sign = change > 0 ? "+" : "−";
  return `${sign}${Math.abs(change).toFixed(1)} kg since ${shortDate(first.day)}`;
}

export const WEIGHT_SOURCE_LABEL: Record<"manual" | "apple_health" | "health_connect" | "withings", string> = {
  manual: "Entered",
  apple_health: "Apple Health",
  health_connect: "Health Connect",
  withings: "Withings",
};
