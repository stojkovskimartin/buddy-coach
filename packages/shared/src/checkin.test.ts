import { describe, expect, it } from "vitest";

import { limitingText, parseSleepHours, scaleOptionLabel } from "./checkin";

describe("parseSleepHours", () => {
  it.each([
    ["", null],
    ["  ", null],
    ["7", 7],
    ["7.5", 7.5],
    ["7,5", 7.5],
    ["0", 0],
    ["16", 16],
    ["16.5", "invalid"],
    ["-1", "invalid"],
    ["abc", "invalid"],
    ["7,5,1", "invalid"],
  ])("%j -> %j", (input, expected) => {
    expect(parseSleepHours(input)).toBe(expected);
  });
});

describe("labels", () => {
  it("names the ends of the scale", () => {
    const q = { low: "Very badly", high: "Great" };
    expect(scaleOptionLabel(1, q)).toBe("1 of 5 (Very badly)");
    expect(scaleOptionLabel(3, q)).toBe("3 of 5");
    expect(scaleOptionLabel(5, q)).toBe("5 of 5 (Great)");
  });

  it("explains what held readiness back", () => {
    expect(limitingText([])).toBeNull();
    expect(limitingText(["sleep", "hrv", "new_factor"])).toBe(
      "Held back by: sleep, heart rate variability, new_factor.",
    );
  });
});
