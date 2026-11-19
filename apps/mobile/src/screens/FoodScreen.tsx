import type { MealDay, MealEntry, NutritionTargets } from "@buddy/api-client";
import {
  MACROS,
  MEAL_LABEL,
  OFF_ATTRIBUTION,
  daysBefore,
  foodByBarcode,
  mealForHour,
  parseAmount,
  parseGrams,
  portion,
  searchFoods,
  type Food,
} from "@buddy/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { BarcodeScanner } from "../components/BarcodeScanner";
import { Button, Card, ErrorBanner, Field } from "../components/ui";
import { errorMessage, useSession } from "../lib/session";
import { TOUCH_TARGET, colors, font, radius, space } from "../theme";

type Meal = MealEntry["meal"];
const MEALS = Object.keys(MEAL_LABEL) as Meal[];

/** The food diary of one day: totals against today's targets, entries per meal, and adding food
 * from Open Food Facts (search or barcode scan) or typed in. Loads when first shown. */
export function FoodScreen({ active = true }: { active?: boolean }) {
  const { api } = useSession();
  const [picked, setPicked] = useState<string | null>(null); // null = today on the server
  const [day, setDay] = useState<MealDay | null>(null);
  const [targets, setTargets] = useState<NutritionTargets | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  const shown = useRef(false);

  const load = useCallback(async () => {
    const id = ++request.current; // only the newest request may update the screen
    setLoading(true);
    try {
      // Targets are optional here: without them the diary still shows.
      const [d, t] = await Promise.all([
        api.getMealDay(picked ?? undefined),
        api.getTodayTargets().catch(() => null),
      ]);
      if (id !== request.current) return;
      setDay(d);
      setTargets(t);
      setError(null);
    } catch (e) {
      if (id === request.current) setError(errorMessage(e));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [api, picked]);

  useEffect(() => {
    if (!active && !shown.current) return;
    shown.current = true;
    void load();
  }, [active, load]);

  const today = targets?.day ?? null;
  const isToday = picked === null || picked === today;

  function remove(entry: MealEntry) {
    Alert.alert(`Delete ${entry.name}?`, undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          void api.deleteMeal(entry.id).then(load, (e: unknown) => setError(errorMessage(e))),
      },
    ]);
  }

  return (
    <ScrollView
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
    >
      <Text accessibilityRole="header" style={styles.title}>
        Food
      </Text>
      <ErrorBanner message={error} />
      {day && (
        <View style={styles.dayRow}>
          <Button
            variant="secondary"
            label="Previous day"
            onPress={() => setPicked(daysBefore(day.day, 1))}
          />
          <Text style={styles.dayText}>{isToday ? "Today" : day.day}</Text>
          <Button
            variant="secondary"
            label="Next day"
            disabled={isToday}
            onPress={() => setPicked(today && daysBefore(day.day, -1) < today ? daysBefore(day.day, -1) : null)}
          />
        </View>
      )}
      {day && (
        <Card>
          <Totals day={day} targets={isToday ? targets : null} />
          {MEALS.map((meal) => {
            const entries = day.entries.filter((e) => e.meal === meal);
            if (entries.length === 0) return null;
            return (
              <View key={meal} style={styles.meal}>
                <Text accessibilityRole="header" style={styles.heading}>
                  {MEAL_LABEL[meal]}
                </Text>
                {entries.map((e) => (
                  <View key={e.id} style={styles.entry}>
                    <Text style={styles.body}>
                      {e.name} <Text style={styles.muted}>· {e.grams} g · {Math.round(e.kcal)} kcal</Text>
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${e.name}`}
                      onPress={() => remove(e)}
                      style={styles.linkButton}
                    >
                      <Text style={styles.link}>Delete</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            );
          })}
          {day.entries.length === 0 && <Text style={styles.muted}>Nothing logged for this day yet.</Text>}
        </Card>
      )}
      {day && isToday && <AddFood onAdded={load} />}
    </ScrollView>
  );
}

function Totals({ day, targets }: { day: MealDay; targets: NutritionTargets | null }) {
  const rows = [{ key: "kcal" as const, label: "Calories", unit: "kcal" }, ...MACROS.map((m) => ({ ...m, unit: "g" }))];
  return (
    <View style={styles.totals}>
      {rows.map((r) => {
        const eaten = Math.round(day.totals[r.key]);
        const target = targets?.[r.key];
        const text = target ? `${eaten} of ${target} ${r.unit}` : `${eaten} ${r.unit}`;
        return (
          <View key={r.key} accessible accessibilityLabel={`${r.label}: ${text}`} style={styles.total}>
            <View style={styles.totalRow}>
              <Text style={styles.body}>{r.label}</Text>
              <Text style={styles.body}>{text}</Text>
            </View>
            {target ? (
              <View style={styles.bar}>
                <View style={[styles.fill, { width: `${Math.min(100, (eaten / target) * 100)}%` }]} />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function AddFood({ onAdded }: { onAdded: () => Promise<void> }) {
  const { api } = useSession();
  const [meal, setMeal] = useState<Meal>(() => mealForHour(new Date().getHours()));
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Food[] | null>(null);
  const [food, setFood] = useState<Food | null>(null);
  const [grams, setGrams] = useState("100");
  const [manual, setManual] = useState(false);
  const [scanning, setScanning] = useState(false);
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

  const search = () => {
    if (!query.trim()) return;
    void run(async () => {
      setFood(null);
      setResults(await searchFoods(query, fetch));
    });
  };

  const scanned = (code: string) => {
    setScanning(false);
    void run(async () => {
      // iPhones report a UPC-A code as EAN-13 with a leading 0.
      const found =
        (await foodByBarcode(code, fetch)) ??
        (code.length === 13 && code.startsWith("0") ? await foodByBarcode(code.slice(1), fetch) : null);
      if (!found) throw new Error("No food with this barcode in Open Food Facts. Search by name or type it in.");
      setResults(null);
      setFood(found);
    });
  };

  const add = () => {
    const g = parseGrams(grams);
    if (!food || g === null) return setError("Enter the grams eaten (1-5000).");
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
      await onAdded();
    });
  };

  const g = parseGrams(grams);
  const preview = food && g !== null ? portion(food.per100g, g) : null;

  return (
    <Card>
      <Text accessibilityRole="header" style={styles.heading}>
        Add food
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Meal" style={styles.meals}>
        {MEALS.map((m) => (
          <Pressable
            key={m}
            accessibilityRole="radio"
            accessibilityState={{ selected: m === meal }}
            onPress={() => setMeal(m)}
            style={[styles.chip, m === meal && styles.chipOn]}
          >
            <Text style={[styles.chipText, m === meal && styles.chipTextOn]}>{MEAL_LABEL[m]}</Text>
          </Pressable>
        ))}
      </View>
      <ErrorBanner message={error} />
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
          <Field
            label="Search food"
            placeholder="e.g. oat flakes"
            value={query}
            returnKeyType="search"
            onChangeText={setQuery}
            onSubmitEditing={search}
          />
          <Button label="Search" busy={busy} disabled={!query.trim()} onPress={search} />
          <Button variant="secondary" label="Scan a barcode" disabled={busy} onPress={() => setScanning(true)} />
          {results && results.length === 0 && (
            <Text style={styles.muted}>No match. Try other words or type it in.</Text>
          )}
          {results?.map((f) => (
            <View key={f.barcode} style={styles.entry}>
              <Text style={styles.body}>
                {f.name}{" "}
                <Text style={styles.muted}>
                  {f.brand ? `· ${f.brand} ` : ""}· {Math.round(f.per100g.kcal)} kcal / 100 g
                </Text>
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Choose ${f.name}`}
                onPress={() => {
                  setFood(f);
                  setResults(null);
                }}
                style={styles.linkButton}
              >
                <Text style={styles.link}>Choose</Text>
              </Pressable>
            </View>
          ))}
          {food && (
            <View style={styles.portion}>
              <Text style={styles.body}>
                <Text style={styles.strong}>{food.name}</Text>
                {food.brand ? <Text style={styles.muted}> · {food.brand}</Text> : null}
              </Text>
              <Field label="Grams eaten" keyboardType="decimal-pad" value={grams} onChangeText={setGrams} />
              {preview && (
                <Text style={styles.muted}>
                  {Math.round(preview.kcal)} kcal · protein {preview.protein_g} g · carbs {preview.carbs_g} g · fat{" "}
                  {preview.fat_g} g
                </Text>
              )}
              <Button
                label={`Add to ${MEAL_LABEL[meal].toLowerCase()}`}
                busy={busy}
                disabled={!preview}
                onPress={add}
              />
            </View>
          )}
          <Button variant="secondary" label="Type in a food instead" onPress={() => setManual(true)} />
          <Text style={styles.muted}>{OFF_ATTRIBUTION}</Text>
          <BarcodeScanner visible={scanning} onScanned={scanned} onClose={() => setScanning(false)} />
        </>
      )}
    </Card>
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
  const [fields, setFields] = useState({ name: "", grams: "", kcal: "", protein_g: "", carbs_g: "", fat_g: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const grams = parseGrams(fields.grams);
    const values = {
      kcal: parseAmount(fields.kcal),
      protein_g: parseAmount(fields.protein_g || "0"),
      carbs_g: parseAmount(fields.carbs_g || "0"),
      fat_g: parseAmount(fields.fat_g || "0"),
    };
    if (!fields.name.trim() || grams === null || Object.values(values).some((v) => v === null)) {
      return setError("Enter a name, the grams (1-5000) and the calories; protein, carbs and fat are optional.");
    }
    setBusy(true);
    setError(null);
    try {
      await api.logMeal({ meal, name: fields.name.trim(), grams, ...(values as Record<keyof typeof values, number>) });
      await onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof typeof fields, label: string) => (
    <Field
      label={label}
      keyboardType={key === "name" ? "default" : "decimal-pad"}
      maxLength={key === "name" ? 120 : 8}
      value={fields[key]}
      onChangeText={(text) => setFields({ ...fields, [key]: text })}
    />
  );

  return (
    <View style={styles.portion}>
      <ErrorBanner message={error} />
      {field("name", "Food")}
      {field("grams", "Grams eaten")}
      <Text style={styles.muted}>For the portion eaten:</Text>
      {field("kcal", "Calories (kcal)")}
      {field("protein_g", "Protein (g)")}
      {field("carbs_g", "Carbs (g)")}
      {field("fat_g", "Fat (g)")}
      <Button label={`Add to ${MEAL_LABEL[meal].toLowerCase()}`} busy={busy} onPress={() => void submit()} />
      <Button variant="secondary" label="Back to search" onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space.lg, gap: space.lg, backgroundColor: colors.background },
  title: { fontSize: font.heading, fontWeight: "700", color: colors.text },
  heading: { fontSize: font.title, fontWeight: "600", color: colors.text },
  body: { fontSize: font.body, color: colors.text, flexShrink: 1 },
  strong: { fontWeight: "700" },
  muted: { fontSize: font.small, color: colors.muted },
  dayRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  dayText: { fontSize: font.body, fontWeight: "600", color: colors.text },
  totals: { gap: space.sm },
  total: { gap: space.xs },
  totalRow: { flexDirection: "row", justifyContent: "space-between" },
  bar: { height: 6, borderRadius: radius.pill, backgroundColor: colors.border, overflow: "hidden" },
  fill: { height: 6, backgroundColor: colors.primary },
  meal: { gap: space.xs },
  entry: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  linkButton: { minHeight: TOUCH_TARGET, justifyContent: "center" },
  link: { color: colors.primary, fontWeight: "600", fontSize: font.body },
  meals: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: space.md,
    justifyContent: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { color: colors.primary, fontSize: font.body },
  chipTextOn: { color: colors.primaryText, fontWeight: "600" },
  portion: { gap: space.md },
});
