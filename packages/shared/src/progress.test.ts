import { describe, expect, it } from "vitest";

import { average, daysBefore, localToday } from "./progress";

describe("progress helpers", () => {
  it("counts days back over month and year ends", () => {
    expect(daysBefore("2026-03-01", 1)).toBe("2026-02-28");
    expect(daysBefore("2026-01-10", 27)).toBe("2025-12-14");
  });

  it("gives today in the device's time zone", () => {
    const at = (iso: string, offsetMinutes: number) => {
      const date = new Date(iso);
      date.getTimezoneOffset = () => offsetMinutes; // minutes behind UTC, as the browser reports
      return date;
    };
    expect(localToday(at("2026-11-18T23:30:00Z", -60))).toBe("2026-11-19"); // Zurich, after midnight
    expect(localToday(at("2026-11-19T03:00:00Z", 300))).toBe("2026-11-18"); // New York, before
  });

  it("averages, or returns null for no values", () => {
    expect(average([2400, 2601])).toBe(2501);
    expect(average([])).toBeNull();
  });
});
