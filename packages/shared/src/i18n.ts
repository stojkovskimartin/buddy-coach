/**
 * Languages and the shared wording in each of them. English stays the source (the constants in
 * checkin.ts, targets.ts, ... are the English texts); Macedonian must have every key, which the
 * `SharedText` type enforces at compile time.
 */
import {
  CHECKIN_QUESTIONS,
  PAIN_LABEL,
  PAIN_NOTE,
  READINESS_NOTE,
  READINESS_TEXT,
  SLEEP_HOURS_ERROR,
  limitingText,
  scaleOptionLabel,
  type CheckinScale,
  type ReadinessLevel,
} from "./checkin";
import { importText, syncText } from "./connections";
import { MEAL_LABEL, OFF_ATTRIBUTION } from "./foods";
import { foodSummary, readinessSummary, trainingSummary, CHECKIN_RANGE_DAYS, average } from "./progress";
import { ENERGY_GOAL_TEXT, NO_TARGETS_TEXT, type EnergyGoal } from "./targets";
import { WEIGHT_EMPTY_TEXT, WEIGHT_INPUT_ERROR, WEIGHT_SOURCE_LABEL, trendChangeText } from "./weight";

export type Locale = "en" | "mk";

export const LOCALES: readonly Locale[] = ["en", "mk"];

/** Each language's own name, for the language switch. */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", mk: "Македонски" };

/** BCP 47 tag for Intl formatting. English keeps the formats the apps have always used. */
export const INTL_LOCALE: Record<Locale, string> = { en: "en-US", mk: "mk-MK" };

/** A saved choice wins; otherwise the first supported device language; otherwise English. */
export function pickLocale(saved: string | null | undefined, languages: readonly string[]): Locale {
  if (saved === "en" || saved === "mk") return saved;
  for (const language of languages) {
    const base = language.toLowerCase().split("-")[0];
    if (base === "mk" || base === "en") return base;
  }
  return "en";
}

/**
 * Macedonian plural: the singular after 1, 21, 31, ... but not after 11 ("1 ден", "21 ден",
 * "11 дена"). Written by hand because Hermes (Android) has no Intl.PluralRules.
 */
export function mkPlural(n: number): "one" | "other" {
  return Math.abs(n) % 10 === 1 && Math.abs(n) % 100 !== 11 ? "one" : "other";
}

/** "1 ден", "5 дена". */
export function mkCount(n: number, one: string, other: string): string {
  return `${n} ${mkPlural(n) === "one" ? one : other}`;
}

/** A number with Macedonian decimal comma: 77.4 → "77,4". */
export function mkNumber(value: number | string): string {
  return String(value).replace(".", ",");
}

export type Meal = keyof typeof MEAL_LABEL;
export type WeightSource = keyof typeof WEIGHT_SOURCE_LABEL;
export type RangeDays = 28 | 90 | 365;

export interface SharedText {
  checkinQuestions: readonly { key: CheckinScale; question: string; low: string; high: string }[];
  scaleOptionLabel: (value: number, question: { low: string; high: string }) => string;
  readinessText: Record<ReadinessLevel, string>;
  readinessNote: string;
  painNote: string;
  painLabel: string;
  limitingText: (factors: readonly string[]) => string | null;
  sleepHoursError: string;
  energyGoalText: Record<EnergyGoal, string>;
  macroLabels: Record<"protein_g" | "carbs_g" | "fat_g", string>;
  noTargets: string;
  importText: (result: { created: number; updated: number }) => string;
  syncText: (
    result: { synced: boolean; created: number; updated: number },
    what: "weight" | "workout",
  ) => string;
  weightEmpty: string;
  weightInputError: string;
  trendChangeText: (trend: readonly { day: string; weight_kg: number }[]) => string | null;
  weightSourceLabel: Record<WeightSource, string>;
  offAttribution: string;
  mealLabel: Record<Meal, string>;
  rangeLabel: Record<RangeDays, string>;
  foodSummary: (
    days: readonly { kcal: number; protein_g: number }[],
    target: { kcal: number; protein_g: number } | null,
  ) => string;
  trainingSummary: (today: { fitness: number; fatigue: number; form: number }, ratio: number | null) => string;
  readinessSummary: (scores: readonly number[], days: number) => string;
}

const en: SharedText = {
  checkinQuestions: CHECKIN_QUESTIONS,
  scaleOptionLabel,
  readinessText: READINESS_TEXT,
  readinessNote: READINESS_NOTE,
  painNote: PAIN_NOTE,
  painLabel: PAIN_LABEL,
  limitingText,
  sleepHoursError: SLEEP_HOURS_ERROR,
  energyGoalText: ENERGY_GOAL_TEXT,
  macroLabels: { protein_g: "Protein", carbs_g: "Carbs", fat_g: "Fat" },
  noTargets: NO_TARGETS_TEXT,
  importText,
  syncText,
  weightEmpty: WEIGHT_EMPTY_TEXT,
  weightInputError: WEIGHT_INPUT_ERROR,
  trendChangeText,
  weightSourceLabel: WEIGHT_SOURCE_LABEL,
  offAttribution: OFF_ATTRIBUTION,
  mealLabel: MEAL_LABEL,
  rangeLabel: { 28: "4 weeks", 90: "3 months", 365: "1 year" },
  foodSummary,
  trainingSummary,
  readinessSummary,
};

const MK_FACTORS: Record<string, string> = {
  sleep: "сонот",
  soreness: "болните мускули",
  mood: "расположението",
  hrv: "варијабилноста на срцевиот ритам",
  resting_hr: "пулсот во мирување",
  training_load: "неодамнешното тренажно оптоварување",
  pain: "болката",
};

function mkShortDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(INTL_LOCALE.mk, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const mk: SharedText = {
  checkinQuestions: [
    { key: "sleep_quality", question: "Како спиеше?", low: "Многу лошо", high: "Одлично" },
    { key: "soreness", question: "Како ги чувствуваш мускулите?", low: "Многу болни", high: "Свежи" },
    { key: "mood", question: "Како се чувствуваш?", low: "Многу лошо", high: "Одлично" },
  ],
  scaleOptionLabel: (value, question) => {
    const end = value === 1 ? ` (${question.low})` : value === 5 ? ` (${question.high})` : "";
    return `${value} од 5${end}`;
  },
  readinessText: {
    green: "Може да тренираш според планот.",
    amber: "Размисли за полесен тренинг денес.",
    red: "Размисли за одмор или лесно закрепнување денес.",
  },
  readinessNote: "Насока за тренингот според твоите одговори, не медицински совет.",
  painNote:
    "Кажа дека имаш болка. Ако не поминува, оди на лекар или физиотерапевт. Ако болката е силна " +
    "или ненадејна, или имаш болка во градите, веднаш побарај медицинска помош.",
  painLabel: "Денес имам болка (не обичната болка во мускулите по тренинг)",
  limitingText: (factors) =>
    factors.length === 0 ? null : `Ја намалуваат: ${factors.map((f) => MK_FACTORS[f] ?? f).join(", ")}.`,
  sleepHoursError: "Внеси од 0 до 16 часа.",
  energyGoalText: { lose: "Слабеење", maintain: "Одржување на тежината", gain: "Зголемување на тежината" },
  macroLabels: { protein_g: "Протеини", carbs_g: "Јаглехидрати", fat_g: "Масти" },
  noTargets: "Пополни го профилот за да ги видиш денешните цели за калории и макронутриенти.",
  importText: (result) => {
    const added =
      mkPlural(result.created) === "one"
        ? `${result.created} нов тренинг`
        : `${result.created} нови тренинзи`;
    return result.updated ? `${added}, ${mkCount(result.updated, "ажуриран", "ажурирани")}` : added;
  },
  syncText: (result, what) => {
    if (!result.synced) return "Синхронизирано пред помалку од 10 минути, обиди се подоцна";
    if (!result.created && !result.updated) return what === "weight" ? "Нема нови мерења" : "Нема нови тренинзи";
    const one = mkPlural(result.created) === "one";
    const added =
      what === "weight"
        ? `${result.created} ${one ? "ново мерење" : "нови мерења"}`
        : `${result.created} ${one ? "нов тренинг" : "нови тренинзи"}`;
    return result.updated ? `${added}, ${mkCount(result.updated, "ажурирано", "ажурирани")}` : added;
  },
  weightEmpty: "Внеси ја тежината или поврзи паметна вага преку Apple Health или Health Connect.",
  weightInputError: "Внеси тежина помеѓу 30 и 300 кг.",
  trendChangeText: (trend) => {
    if (trend.length < 2) return null;
    const first = trend[0]!;
    const change = Math.round((trend[trend.length - 1]!.weight_kg - first.weight_kg) * 10) / 10;
    if (change === 0) return `Стабилно од ${mkShortDate(first.day)}`;
    const sign = change > 0 ? "+" : "−";
    return `${sign}${mkNumber(Math.abs(change).toFixed(1))} кг од ${mkShortDate(first.day)}`;
  },
  weightSourceLabel: {
    manual: "Внесено",
    apple_health: "Apple Health",
    health_connect: "Health Connect",
    withings: "Withings",
  },
  offAttribution: "Податоци за храна од Open Food Facts (ODbL).",
  mealLabel: { breakfast: "Појадок", lunch: "Ручек", dinner: "Вечера", snack: "Ужина" },
  rangeLabel: { 28: "4 недели", 90: "3 месеци", 365: "1 година" },
  foodSummary: (days, target) => {
    const goal = target ? ` (денешна цел: ${target.kcal} ккал, ${target.protein_g} г протеини)` : "";
    return `Внесено за ${mkCount(days.length, "ден", "дена")} · просечно ${average(
      days.map((d) => d.kcal),
    )} ккал и ${average(days.map((d) => d.protein_g))} г протеини${goal}`;
  },
  trainingSummary: (today, ratio) => {
    const load = ratio !== null ? ` · сооднос на оптоварување ${mkNumber(ratio)}` : "";
    return `Кондиција ${mkNumber(today.fitness)} · замор ${mkNumber(today.fatigue)} · форма ${mkNumber(
      today.form,
    )}${load}`;
  },
  readinessSummary: (scores, days) => {
    const recent = days > CHECKIN_RANGE_DAYS ? ` (последните ${CHECKIN_RANGE_DAYS} дена)` : "";
    return `${mkCount(scores.length, "проверка", "проверки")} · просечно ${average(scores)} од 100${recent}`;
  },
};

/** The shared wording in one language. */
export const SHARED_TEXT: Record<Locale, SharedText> = { en, mk };
