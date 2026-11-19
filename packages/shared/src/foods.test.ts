import { describe, expect, it, vi } from "vitest";

import { foodByBarcode, mealForHour, parseGrams, portion, searchFoods, toFood } from "./foods";

const OATS = {
  code: "7610000000017",
  product_name: " Oat flakes ",
  brands: "Coop, Naturaplan",
  nutriments: { "energy-kcal_100g": 375, proteins_100g: 13, carbohydrates_100g: 59, fat_100g: "7" },
};

const reply = (body: unknown, status = 200) =>
  vi.fn(async (_url: string) => ({ ok: status < 400, status, json: async () => body }));

describe("toFood", () => {
  it("keeps name, first brand and per-100 g values", () => {
    expect(toFood(OATS)).toEqual({
      name: "Oat flakes",
      brand: "Coop",
      barcode: "7610000000017",
      per100g: { kcal: 375, protein_g: 13, carbs_g: 59, fat_g: 7 },
    });
  });

  it("drops products without calories, name or a valid barcode, and bad numbers", () => {
    expect(toFood({ ...OATS, nutriments: {} })).toBeNull();
    expect(toFood({ ...OATS, product_name: "" })).toBeNull();
    expect(toFood({ ...OATS, code: "abc" })).toBeNull();
    expect(toFood({ ...OATS, nutriments: { "energy-kcal_100g": 1600 } })).toBeNull(); // kJ as kcal
    expect(toFood({ ...OATS, nutriments: { "energy-kcal_100g": 905 } })).toBeNull(); // above pure fat
    const tooMuch = { "energy-kcal_100g": 500, proteins_100g: 30, carbohydrates_100g: 59, fat_100g: 40 };
    expect(toFood({ ...OATS, nutriments: tooMuch })).toBeNull(); // macros above 100 g per 100 g
    expect(toFood({ ...OATS, nutriments: { "energy-kcal_100g": 50, fat_100g: -1 } })?.per100g.fat_g).toBe(0);
  });
});

describe("Open Food Facts", () => {
  it("searches by text and keeps usable products", async () => {
    const fetchJson = reply({ products: [OATS, { code: "1", product_name: "junk" }] });
    const foods = await searchFoods(" oats ", fetchJson);
    expect(foods.map((f) => f.name)).toEqual(["Oat flakes"]);
    const url = new URL(fetchJson.mock.calls[0]![0]);
    expect(url.pathname).toBe("/cgi/search.pl");
    expect(url.searchParams.get("search_terms")).toBe("oats");
  });

  it("reports a failed search", async () => {
    await expect(searchFoods("oats", reply({}, 503))).rejects.toThrow(/not available/);
  });

  it("looks up a barcode, and returns null for unknown or invalid ones", async () => {
    const found = reply({ status: 1, product: { ...OATS, code: undefined } });
    expect((await foodByBarcode("7610000000017", found))?.barcode).toBe("7610000000017");
    expect(found.mock.calls[0]![0]).toContain("/api/v2/product/7610000000017?");
    expect(await foodByBarcode("7610000000017", reply({ status: 0 }))).toBeNull();
    expect(await foodByBarcode("7610000000017", reply({ status: 0 }, 404))).toBeNull();
    await expect(foodByBarcode("7610000000017", reply({}, 429))).rejects.toThrow(/not available/);
    const never = reply({});
    await expect(foodByBarcode("12ab", never)).rejects.toThrow(/6 to 32 digits/);
    expect(never).not.toHaveBeenCalled();
  });
});

describe("portions", () => {
  it("scales per-100 g values to the grams eaten", () => {
    expect(portion({ kcal: 375, protein_g: 13, carbs_g: 59, fat_g: 7 }, 80)).toEqual({
      kcal: 300,
      protein_g: 10.4,
      carbs_g: 47.2,
      fat_g: 5.6,
    });
  });

  it("parses grams with comma or point within 1-5000 g", () => {
    expect(parseGrams("80,5")).toBe(80.5);
    for (const text of ["", "0", "5001", "1e2"]) expect(parseGrams(text)).toBeNull();
  });

  it("suggests the meal by the hour", () => {
    expect([7, 12, 16, 19, 23].map(mealForHour)).toEqual(["breakfast", "lunch", "snack", "dinner", "snack"]);
  });
});
