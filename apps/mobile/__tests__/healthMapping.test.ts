import { healthConnectActivity, healthKitActivity } from "../src/health/activityMapping";
import { chunk, prepareWorkout } from "../src/health/prepare";
import type { RawWorkout } from "../src/health/types";
import { toKilocalories, toKilometers, toMinutes } from "../src/health/units";

const NOW = new Date("2026-11-19T08:00:00Z");

function raw(overrides: Partial<RawWorkout> = {}): RawWorkout {
  return {
    external_id: "A1",
    activity: "running",
    started_at: "2026-11-18T07:00:00.000Z",
    duration_min: 50,
    distance_km: 10.2,
    avg_hr: 150,
    max_hr: 175,
    kcal: 700,
    ...overrides,
  };
}

describe("activity mapping", () => {
  it.each([
    [37, false, "running"],
    [13, false, "cycling"],
    [13, true, "indoor_cycling"],
    [61, false, "alpine_skiing"],
    [60, false, "cross_country_skiing"],
    [50, false, "strength"],
    [82, false, "other"], // swimBikeRun has no single activity
    [9999, false, "other"],
  ])("HealthKit %i (indoor %s) -> %s", (type, indoor, expected) => {
    expect(healthKitActivity(type, indoor)).toBe(expected);
  });

  it.each([
    [56, "running"],
    [57, "running"],
    [9, "indoor_cycling"],
    [74, "swimming"],
    [61, "other"], // SKIING does not say alpine, cross-country or touring
    [0, "other"],
  ])("Health Connect %i -> %s", (type, expected) => {
    expect(healthConnectActivity(type)).toBe(expected);
  });
});

describe("units", () => {
  it("converts the stores' units", () => {
    expect(toMinutes(3000, "s")).toBe(50);
    expect(toMinutes(1.5, "hr")).toBe(90);
    expect(toKilometers(10200, "m")).toBe(10.2);
    expect(toKilometers(1, "mi")).toBeCloseTo(1.609, 3);
    expect(toKilocalories(4184, "kJ")).toBeCloseTo(1000, 0);
    expect(toMinutes(1, "fortnight")).toBeNull();
  });
});

describe("prepareWorkout", () => {
  it("sends UTC times and the platform as source", () => {
    const prepared = prepareWorkout(raw(), "apple_health", NOW);
    expect(prepared).toMatchObject({
      source: "apple_health",
      external_id: "A1",
      started_at: "2026-11-18T07:00:00.000Z",
      duration_min: 50,
      avg_hr: 150,
    });
  });

  it.each([
    ["zero duration", { duration_min: 0 }],
    ["longer than a day", { duration_min: 1441 }],
    ["in the future", { started_at: "2026-11-19T10:00:00Z" }],
    ["no valid date", { started_at: "yesterday" }],
  ])("drops a workout with %s", (_, overrides) => {
    expect(prepareWorkout(raw(overrides), "health_connect", NOW)).toBeNull();
  });

  it("clears impossible values instead of losing the workout", () => {
    const prepared = prepareWorkout(
      raw({ avg_hr: 170, max_hr: 160, distance_km: 5000, kcal: -3 }),
      "health_connect",
      NOW,
    );
    expect(prepared).toMatchObject({ avg_hr: null, max_hr: null, distance_km: null, kcal: null });
  });

  it("keeps a little clock drift", () => {
    expect(prepareWorkout(raw({ started_at: "2026-11-19T08:30:00Z" }), "apple_health", NOW)).not.toBeNull();
  });
});

describe("chunk", () => {
  it("splits into batches of at most 500", () => {
    expect(chunk(Array.from({ length: 1001 }, (_, i) => i)).map((c) => c.length)).toEqual([
      500, 500, 1,
    ]);
  });
});
