import { localToday } from "@buddy/shared";

export type DayPart = "morning" | "afternoon" | "evening";

/** Morning until noon, afternoon until 6 pm, evening after that (device time). */
export function dayPart(now: Date = new Date()): DayPart {
  const hour = now.getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

export const GREETING: Record<DayPart, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
};

/** The check-in's question; later in the day it asks about the day so far. */
export const CHECKIN_PROMPT: Record<DayPart, string> = {
  morning: "How do you feel this morning?",
  afternoon: "How is your day going?",
  evening: "How was your day?",
};

/** "Friday, 20 November" for the device's language settings (English for now). */
export function longDate(now: Date = new Date()): string {
  return now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

/** "Fri 20 Nov" for an ISO day, the same everywhere (the day is not shifted by time zones). */
export function shortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
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
