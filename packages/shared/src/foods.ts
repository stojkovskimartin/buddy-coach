/**
 * Food lookup in Open Food Facts (ODbL), called directly by the apps so its rate limits apply per
 * user (100 product reads, about 10 searches a minute): search only on submit. Responses are
 * crowd-sourced, so every number is checked before use and products without calories are left out.
 */

export const OFF_ORIGIN = "https://world.openfoodfacts.org";
export const OFF_ATTRIBUTION = "Food data from Open Food Facts (ODbL).";
const FIELDS = "code,product_name,brands,nutriments";

export interface Per100g {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface Food {
  name: string;
  brand: string | null;
  barcode: string;
  per100g: Per100g;
}

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface OffProduct {
  code?: unknown;
  product_name?: unknown;
  brands?: unknown;
  nutriments?: Record<string, unknown>;
}

function nutrient(nutriments: Record<string, unknown>, key: string, max: number): number | null {
  const value = Number(nutriments[key]);
  return Number.isFinite(value) && value >= 0 && value <= max ? value : null;
}

/** An Open Food Facts product as a Food, or null when name, barcode or values are unusable. */
export function toFood(product: OffProduct): Food | null {
  const name = typeof product.product_name === "string" ? product.product_name.trim() : "";
  const barcode = typeof product.code === "string" ? product.code : "";
  const n = product.nutriments ?? {};
  // Pure fat has 900 kcal per 100 g; the server allows 5 % more for the rounding of portions.
  const kcal = nutrient(n, "energy-kcal_100g", 900);
  if (!name || !/^\d{6,32}$/.test(barcode) || kcal === null) return null;
  const grams = (key: string) => nutrient(n, key, 100) ?? 0;
  const per100g = {
    kcal,
    protein_g: grams("proteins_100g"),
    carbs_g: grams("carbohydrates_100g"),
    fat_g: grams("fat_100g"),
  };
  if (per100g.protein_g + per100g.carbs_g + per100g.fat_g > 100) return null;
  const brands = typeof product.brands === "string" ? product.brands.split(",")[0]!.trim() : "";
  return { name: name.slice(0, 120), brand: brands || null, barcode, per100g };
}

/** Products matching a text, best first. */
export async function searchFoods(query: string, fetchJson: Fetch): Promise<Food[]> {
  const params = new URLSearchParams({
    search_terms: query.trim(),
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: "20",
    fields: FIELDS,
  });
  const response = await fetchJson(`${OFF_ORIGIN}/cgi/search.pl?${params}`);
  if (!response.ok) throw new Error(UNAVAILABLE);
  const body = (await response.json()) as { products?: OffProduct[] };
  return (body.products ?? []).map(toFood).filter((f): f is Food => f !== null);
}

const UNAVAILABLE = "Food search is not available right now. Try again in a minute.";

/** The product with this barcode, or null when Open Food Facts does not know it. */
export async function foodByBarcode(barcode: string, fetchJson: Fetch): Promise<Food | null> {
  if (!/^\d{6,32}$/.test(barcode)) throw new Error("A barcode has 6 to 32 digits.");
  const response = await fetchJson(`${OFF_ORIGIN}/api/v2/product/${barcode}?fields=${FIELDS}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(UNAVAILABLE);
  const body = (await response.json()) as { status?: number; product?: OffProduct };
  return body.status === 1 && body.product ? toFood({ ...body.product, code: barcode }) : null;
}

/** Nutrients of a portion, rounded to 0.1. */
export function portion(per100g: Per100g, grams: number): Per100g {
  const of = (value: number) => Math.round(((value * grams) / 100) * 10) / 10;
  return {
    kcal: of(per100g.kcal),
    protein_g: of(per100g.protein_g),
    carbs_g: of(per100g.carbs_g),
    fat_g: of(per100g.fat_g),
  };
}

/** "120" or "120,5" grams → number; null outside 1-5000 g. */
export function parseGrams(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+([.,]\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed.replace(",", "."));
  return value >= 1 && value <= 5000 ? value : null;
}

/** "12" or "12,5" → number (for typed-in nutrients); null when it is not a plain number. */
export function parseAmount(text: string): number | null {
  const trimmed = text.trim();
  return /^\d+([.,]\d+)?$/.test(trimmed) ? Number(trimmed.replace(",", ".")) : null;
}

export const MEAL_LABEL: Record<"breakfast" | "lunch" | "dinner" | "snack", string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

/** The meal most people eat around this hour. */
export function mealForHour(hour: number): keyof typeof MEAL_LABEL {
  if (hour < 10) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour >= 18 && hour < 22) return "dinner";
  return "snack";
}
