import { localToday } from "@buddy/shared";

export type DayPart = "morning" | "afternoon" | "evening";

/** Morning until noon, afternoon until 6 pm, evening after that (device time). */
export function dayPart(now: Date = new Date()): DayPart {
  const hour = now.getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

/** "Friday, 20 November" ("петок, 20 ноември" in Macedonian). */
export function longDate(now: Date = new Date(), locale = "en-GB"): string {
  return now.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
}

/** "Fri 20 Nov" for an ISO day, the same everywhere (the day is not shifted by time zones). */
export function shortDay(day: string, locale = "en-GB"): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

const SKIP_KEY = "buddy-checkin-skipped";

/** True when the athlete chose "Not now" for today's check-in on this device. */
export function checkinSkippedToday(now: Date = new Date()): boolean {
  try {
    return window.localStorage.getItem(SKIP_KEY) === localToday(now);
  } catch {
    return false;
  }
}

/** Remember (or forget) "Not now" for today. One key, so old days never pile up. */
export function skipCheckinToday(skip: boolean, now: Date = new Date()): void {
  try {
    if (skip) window.localStorage.setItem(SKIP_KEY, localToday(now));
    else window.localStorage.removeItem(SKIP_KEY);
  } catch {
    // Not remembered: the check-in shows again after a reload, which is harmless.
  }
}
