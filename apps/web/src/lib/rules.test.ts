import { describe, expect, it } from "vitest";

import { daysUntil, goalDateBounds, maxBirthYear } from "./rules";

describe("rules", () => {
  it("mirrors the backend's adult check with a mid-year birthday", () => {
    expect(maxBirthYear(new Date(2026, 2, 1))).toBe(2007); // March: born 2008 is still 17
    expect(maxBirthYear(new Date(2026, 6, 1))).toBe(2008); // from July: born 2008 is 18
  });

  it("allows target dates from tomorrow up to three years", () => {
    expect(goalDateBounds(new Date(2026, 10, 18))).toEqual({
      min: "2026-11-19",
      max: "2029-11-17",
    });
  });

  it("counts calendar days in local time", () => {
    expect(daysUntil("2026-11-20", new Date(2026, 10, 18, 23, 30))).toBe(2);
    expect(daysUntil("2026-11-18", new Date(2026, 10, 18, 0, 5))).toBe(0);
  });
});
