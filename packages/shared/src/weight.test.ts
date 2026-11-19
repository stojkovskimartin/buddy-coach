import { describe, expect, it } from "vitest";

import { scaleSeries } from "./chart";
import { parseWeightKg, trendChangeText } from "./weight";

describe("parseWeightKg", () => {
  it("accepts comma or point and rounds to 0.1 kg", () => {
    expect(parseWeightKg("77,46")).toBe(77.5);
    expect(parseWeightKg(" 80 ")).toBe(80);
  });

  it("refuses empty, non-numbers and implausible weights", () => {
    for (const text of ["", "abc", "1e2", "0x50", "29.9", "300.1"]) expect(parseWeightKg(text)).toBeNull();
  });
});

describe("trendChangeText", () => {
  it("names the change and the start of the period", () => {
    const trend = [
      { day: "2026-08-21", weight_kg: 79.0 },
      { day: "2026-11-19", weight_kg: 77.84 },
    ];
    expect(trendChangeText(trend)).toBe("−1.2 kg since Aug 21");
    expect(trendChangeText([...trend].reverse())).toBe("+1.2 kg since Nov 19");
    expect(trendChangeText([trend[0]!, { day: "2026-09-01", weight_kg: 79.02 }])).toBe(
      "Steady since Aug 21",
    );
  });

  it("needs two points", () => {
    expect(trendChangeText([{ day: "2026-11-19", weight_kg: 77 }])).toBeNull();
  });
});

describe("scaleSeries", () => {
  it("spreads days over the width and values over the height", () => {
    const scaled = scaleSeries(
      [
        { day: "2026-11-11", value: 80 },
        { day: "2026-11-01", value: 78 },
      ],
      116,
      66,
      { padding: 8 },
    );
    expect(scaled.points.map((p) => [p.day, p.x, p.y])).toEqual([
      ["2026-11-01", 8, 58],
      ["2026-11-11", 108, 8],
    ]);
    expect(scaled.path).toBe("M8.0 58.0 L108.0 8.0");
  });

  it("gives a flat or single-point series headroom and handles none", () => {
    const flat = scaleSeries([{ day: "2026-11-01", value: 70 }], 100, 100, { minSpan: 2 });
    expect([flat.min, flat.max]).toEqual([69, 71]);
    expect(flat.points[0]?.y).toBe(50);
    expect(scaleSeries([], 100, 100)).toEqual({ points: [], path: "", min: 0, max: 0 });
  });
});
