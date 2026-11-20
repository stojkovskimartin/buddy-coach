import type { MealDay, MealEntry, NutritionTargets } from "@buddy/api-client";
import {
  MACROS,
  MEAL_LABEL,
  foodByBarcode,
  mealForHour,
  parseAmount,
  parseGrams,
  portion,
  searchFoods,
  type Food,
} from "@buddy/shared";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { LocalizedError, useI18n } from "../i18n";
import { errorMessage, useSession } from "../lib/session";
import { PhotoStrip } from "./Photos";

type Meal = MealEntry["meal"];
const MEALS = Object.keys(MEAL_LABEL) as Meal[];

/** The food diary of one day: totals against today's targets, entries per meal, and adding food
 * from Open Food Facts (search or barcode) or typed in. */
export function FoodPage() {
  const { api } = useSession();
  const { t, s } = useI18n();
  const [picked, setPicked] = useState(""); // "" = today in the athlete's time zone
  const [day, setDay] = useState<MealDay | null>(null);
  const [targets, setTargets] = useState<NutritionTargets | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current; // only the newest request may update the page
    try {
      // Targets are optional here: without them the diary still shows.
      const [d, t] = await Promise.all([
        api.getMealDay(picked || undefined),
        api.getTodayTargets().catch(() => null),
      ]);
      if (id !== request.current) return;
      setDay(d);
      setTargets(t);
      setError(null);
    } catch (e) {
      if (id === request.current) setError(errorMessage(e));
    }
  }, [api, picked]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(entry: MealEntry) {
    try {
      await api.deleteMeal(entry.id);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const isToday = !picked || picked === targets?.day;

  return (
    <main className="stack">
      <section className="card" aria-labelledby="food-title">
        <h1 id="food-title">{t.food.title}</h1>
        <label className="inline-label">
          {t.food.day}
          <input
            type="date"
            value={picked || day?.day || ""}
            max={targets?.day}
            onChange={(e) => setPicked(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!day ? (
          !error && <p className="muted">{t.loading}</p>
        ) : (
          <>
            <Totals day={day} targets={isToday ? targets : null} />
            {MEALS.map((meal) => {
              const entries = day.entries.filter((e) => e.meal === meal);
              if (entries.length === 0) return null;
              return (
                <div key={meal}>
                  <h2>{s.mealLabel[meal]}</h2>
                  <ul className="entries">
                    {entries.map((e) => (
                      <li key={e.id}>
                        <span>
                          {e.name}{" "}
                          <span className="muted">
                            · {e.grams} {t.units.g} · {Math.round(e.kcal)} {t.units.kcal}
                          </span>
                        </span>
                        <button
                          type="button"
                          className="link"
                          aria-label={t.food.deleteEntry(e.name)}
                          onClick={() => void remove(e)}
                        >
                          {t.delete}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {day.entries.length === 0 && <p className="muted">{t.food.nothing}</p>}
            <h2>{t.food.mealPhotos}</h2>
            <PhotoStrip
              kind="meal"
              title={t.food.mealPhotos}
              range={{ from: day.day, to: day.day }}
              canAdd={isToday}
            />
            <p className="muted small">{t.food.photosNote}</p>
          </>
        )}
      </section>
      {isToday && <AddFood onAdded={load} />}
    </main>
  );
}

function Totals({ day, targets }: { day: MealDay; targets: NutritionTargets | null }) {
  const { t, s } = useI18n();
  const rows = [
    { key: "kcal" as const, label: t.food.calories, unit: t.units.kcal },
    ...MACROS.map((m) => ({ key: m.key, label: s.macroLabels[m.key], unit: t.units.g })),
  ];
  return (
    <dl className="totals">
      {rows.map((r) => {
        const eaten = day.totals[r.key];
        const target = targets?.[r.key];
        return (
          <div key={r.key}>
            <dt>{r.label}</dt>
            <dd>
              {Math.round(eaten)}
              {target ? ` / ${target}` : ""} {r.unit}
              {target ? (
                <progress
                  max={target}
                  value={Math.min(eaten, target)}
                  aria-label={t.food.eatenOfTarget(r.label)}
                />
              ) : null}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function AddFood({ onAdded }: { onAdded: () => Promise<void> }) {
  const { api } = useSession();
  const { t, s, locale } = useI18n();
  // Open Food Facts errors are English; other languages show their own text.
  const lookup = async <T,>(action: () => Promise<T>) => {
    try {
      return await action();
    } catch (e) {
      throw locale === "en" ? e : new LocalizedError(t.food.searchUnavailable);
    }
  };
  const [meal, setMeal] = useState<Meal>(() => mealForHour(new Date().getHours()));
  const [query, setQuery] = useState("");
  const [barcode, setBarcode] = useState("");
  const [results, setResults] = useState<Food[] | null>(null);
  const [food, setFood] = useState<Food | null>(null);
  const [grams, setGrams] = useState("100");
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const search = (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    void run(async () => {
      setFood(null);
      setResults(await lookup(() => searchFoods(query, fetch)));
    });
  };

  const scan = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const found = await lookup(() => foodByBarcode(barcode.trim(), fetch));
      if (!found) throw new LocalizedError(t.food.noBarcode);
      setResults(null);
      setFood(found);
    });
  };

  const add = (event: FormEvent) => {
    event.preventDefault();
    const g = parseGrams(grams);
    if (!food || g === null) return setError(t.food.gramsError);
    void run(async () => {
      await api.logMeal({
        meal,
        name: food.name,
        grams: g,
        ...portion(food.per100g, g),
        source: "open_food_facts",
        barcode: food.barcode,
      });
      setFood(null);
      setResults(null);
      setQuery("");
      setBarcode("");
      await onAdded();
    });
  };

  const g = parseGrams(grams);
  const preview = food && g !== null ? portion(food.per100g, g) : null;

  return (
    <section className="card" aria-labelledby="add-food-title">
      <h2 id="add-food-title">{t.food.add}</h2>
      <label>
        {t.food.meal}
        <select value={meal} onChange={(e) => setMeal(e.target.value as Meal)}>
          {MEALS.map((m) => (
            <option key={m} value={m}>
              {s.mealLabel[m]}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {manual ? (
        <ManualFood
          meal={meal}
          onDone={async () => {
            setManual(false);
            await onAdded();
          }}
          onCancel={() => setManual(false)}
        />
      ) : (
        <>
          <form className="inline" onSubmit={search} aria-label={t.food.searchForm}>
            <label>
              {t.food.search}
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.food.placeholder}
              />
            </label>
            <button type="submit" disabled={busy || !query.trim()}>
              {t.food.searchButton}
            </button>
          </form>
          <form className="inline" onSubmit={scan} aria-label={t.food.barcodeForm}>
            <label>
              {t.food.barcode}
              <input inputMode="numeric" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
            </label>
            <button type="submit" disabled={busy || !barcode.trim()}>
              {t.food.find}
            </button>
          </form>
          {results && (
            <ul className="entries" aria-label={t.food.results}>
              {results.length === 0 && <li className="muted">{t.food.noMatch}</li>}
              {results.map((f) => (
                <li key={f.barcode}>
                  <span>
                    {f.name}{" "}
                    <span className="muted">
                      {f.brand ? `· ${f.brand} ` : ""}· {Math.round(f.per100g.kcal)} {t.food.per100g}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="link"
                    aria-label={t.food.chooseEntry(f.name)}
                    onClick={() => {
                      setFood(f);
                      setResults(null);
                    }}
                  >
                    {t.food.choose}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {food && (
            <form onSubmit={add} aria-label={t.food.portion}>
              <p>
                <strong>{food.name}</strong>
                {food.brand && <span className="muted"> · {food.brand}</span>}
              </p>
              <label>
                {t.food.gramsEaten}
                <input inputMode="decimal" value={grams} onChange={(e) => setGrams(e.target.value)} />
              </label>
              {preview && (
                <p className="muted">
                  {t.food.preview(Math.round(preview.kcal), preview.protein_g, preview.carbs_g, preview.fat_g)}
                </p>
              )}
              <button type="submit" disabled={busy || !preview}>
                {t.food.addTo(s.mealLabel[meal])}
              </button>
            </form>
          )}
          <button type="button" className="link" onClick={() => setManual(true)}>
            {t.food.typeInstead}
          </button>
          <p className="muted small">{s.offAttribution}</p>
        </>
      )}
    </section>
  );
}

function ManualFood({
  meal,
  onDone,
  onCancel,
}: {
  meal: Meal;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const { api } = useSession();
  const { t, s } = useI18n();
  const [fields, setFields] = useState({
    name: "",
    grams: "",
    kcal: "",
    protein_g: "",
    carbs_g: "",
    fat_g: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const grams = parseGrams(fields.grams);
    const values = {
      kcal: parseAmount(fields.kcal),
      protein_g: parseAmount(fields.protein_g || "0"),
      carbs_g: parseAmount(fields.carbs_g || "0"),
      fat_g: parseAmount(fields.fat_g || "0"),
    };
    if (!fields.name.trim() || grams === null || Object.values(values).some((v) => v === null)) {
      return setError(t.food.manualError);
    }
    setBusy(true);
    setError(null);
    try {
      await api.logMeal({
        meal,
        name: fields.name.trim(),
        grams,
        ...(values as Record<keyof typeof values, number>),
      });
      await onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof typeof fields, label: string) => (
    <label>
      {label}
      <input
        inputMode={key === "name" ? "text" : "decimal"}
        maxLength={key === "name" ? 120 : 8}
        value={fields[key]}
        onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <form onSubmit={submit} aria-label={t.food.manualForm}>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {field("name", t.food.foodName)}
      {field("grams", t.food.gramsEaten)}
      <p className="muted small">{t.food.forPortion}</p>
      {field("kcal", t.food.kcalField)}
      {field("protein_g", t.food.proteinField)}
      {field("carbs_g", t.food.carbsField)}
      {field("fat_g", t.food.fatField)}
      <button type="submit" disabled={busy}>
        {t.food.addTo(s.mealLabel[meal])}
      </button>
      <button type="button" className="link" onClick={onCancel}>
        {t.food.back}
      </button>
    </form>
  );
}
