import { describe, expect, it } from "vitest";

import { average, daysBefore, foodSummary, localToday, readinessSummary, trainingSummary } from "./progress";

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

  it("summarises food, training and readiness in words", () => {
    const days = [
      { kcal: 2400, protein_g: 140 },
      { kcal: 2200, protein_g: 120 },
    ];
    expect(foodSummary(days, { kcal: 2500, protein_g: 150 })).toBe(
      "2 days logged · on average 2300 kcal and 130 g protein (today's target: 2500 kcal, 150 g protein)",
    );
    expect(foodSummary(days.slice(0, 1), null)).toBe("1 day logged · on average 2400 kcal and 140 g protein");
    expect(trainingSummary({ fitness: 42, fatigue: 55, form: -13 }, 1.2)).toBe(
      "Fitness 42 · fatigue 55 · form -13 · load ratio 1.2",
    );
    expect(readinessSummary([70, 81], 365)).toBe("2 check-ins · on average 76 of 100 (last 92 days)");
    expect(readinessSummary([70], 28)).toBe("1 check-in · on average 70 of 100");
  });
});
