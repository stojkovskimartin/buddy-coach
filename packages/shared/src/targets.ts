/** Wording for today's calorie and macro targets. */

export type EnergyGoal = "lose" | "maintain" | "gain";

export const ENERGY_GOAL_TEXT: Record<EnergyGoal, string> = {
  lose: "Losing weight",
  maintain: "Keeping your weight",
  gain: "Gaining weight",
};

export const MACROS = [
  { key: "protein_g", label: "Protein" },
  { key: "carbs_g", label: "Carbs" },
  { key: "fat_g", label: "Fat" },
] as const;

export const NO_TARGETS_TEXT = "Complete your profile to see today's calorie and macro targets.";
