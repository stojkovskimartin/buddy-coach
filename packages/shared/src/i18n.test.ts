import { describe, expect, it } from "vitest";

import { SHARED_TEXT, mkCount, mkPlural, pickLocale } from "./i18n";
import { foodSummary, readinessSummary, trainingSummary } from "./progress";

describe("language choice", () => {
  it("prefers a saved choice, then the device's languages, then English", () => {
    expect(pickLocale("mk", ["en-US"])).toBe("mk");
    expect(pickLocale(null, ["de-CH", "mk-MK", "en"])).toBe("mk");
    expect(pickLocale(undefined, ["de-CH", "en-GB"])).toBe("en");
    expect(pickLocale("fr", ["fr-FR"])).toBe("en");
  });
});

describe("Macedonian plural", () => {
  it.each([
    [1, "one"],
    [21, "one"],
    [101, "one"],
    [11, "other"],
    [111, "other"],
    [2, "other"],
    [5, "other"],
    [0, "other"],
  ] as const)("%i is %s", (n, form) => {
    expect(mkPlural(n)).toBe(form);
  });

  it("agrees with Intl where Intl knows Macedonian", () => {
    const rules = new Intl.PluralRules("mk");
    for (let n = 0; n < 250; n++) expect(mkPlural(n)).toBe(rules.select(n) === "one" ? "one" : "other");
  });

  it("writes the count with the right word", () => {
    expect(mkCount(1, "ден", "дена")).toBe("1 ден");
    expect(mkCount(11, "ден", "дена")).toBe("11 дена");
  });
});

describe("shared wording", () => {
  const { en, mk } = SHARED_TEXT;

  it("keeps English exactly as before", () => {
    expect(en.foodSummary).toBe(foodSummary);
    expect(en.trainingSummary).toBe(trainingSummary);
    expect(en.readinessSummary).toBe(readinessSummary);
    expect(en.readinessText.green).toBe("Good to train as planned.");
  });

  it("has every Macedonian text filled in", () => {
    const strings = (value: unknown): string[] =>
      typeof value === "string"
        ? [value]
        : value && typeof value === "object"
          ? Object.values(value).flatMap(strings)
          : [];
    for (const text of strings(mk)) expect(text.trim()).not.toBe("");
    expect(Object.keys(mk).sort()).toEqual(Object.keys(en).sort());
  });

  it("formats Macedonian summaries with Macedonian words and units", () => {
    expect(mk.foodSummary([{ kcal: 2000, protein_g: 120 }], { kcal: 2400, protein_g: 140 })).toBe(
      "Внесено за 1 ден · просечно 2000 ккал и 120 г протеини (денешна цел: 2400 ккал, 140 г протеини)",
    );
    expect(mk.trainingSummary({ fitness: 42, fatigue: 55, form: -13 }, 1.2)).toBe(
      "Кондиција 42 · замор 55 · форма -13 · сооднос на оптоварување 1,2",
    );
    expect(mk.readinessSummary([70, 80], 365)).toBe("2 проверки · просечно 75 од 100 (последните 92 дена)");
    expect(mk.syncText({ synced: true, created: 21, updated: 0 }, "weight")).toBe("21 ново мерење");
    expect(mk.importText({ created: 3, updated: 1 })).toBe("3 нови тренинзи, 1 ажуриран");
    expect(mk.importText({ created: 3, updated: 2 })).toBe("3 нови тренинзи, 2 ажурирани");
    expect(mk.trainingSummary({ fitness: 42.5, fatigue: 55, form: -12.5 }, null)).toBe(
      "Кондиција 42,5 · замор 55 · форма -12,5",
    );
    expect(mk.limitingText(["sleep", "pain"])).toBe("Ја намалуваат: сонот, болката.");
  });

  it("writes a weight change with a decimal comma and a Macedonian date", () => {
    const text = mk.trendChangeText([
      { day: "2026-08-21", weight_kg: 78.4 },
      { day: "2026-09-21", weight_kg: 77.2 },
    ]);
    expect(text).toMatch(/^−1,2 кг од 21/);
  });
});
