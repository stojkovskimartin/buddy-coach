/**
 * Store activity types → the server's ActivityType. Values come from the libraries' own enums
 * (WorkoutActivityType, ExerciseType); anything not listed becomes "other".
 */
import type { ImportedWorkout } from "@buddy/api-client";

export type Activity = ImportedWorkout["activity"];

/** HealthKit HKWorkoutActivityType raw values (see @kingstinct/react-native-healthkit). */
const HEALTHKIT: Record<number, Activity> = {
  37: "running", // running
  13: "cycling", // cycling
  46: "swimming", // swimming
  52: "walking", // walking
  24: "hiking", // hiking
  60: "cross_country_skiing", // crossCountrySkiing
  61: "alpine_skiing", // downhillSkiing
  35: "rowing", // rowing
  20: "strength", // functionalStrengthTraining
  50: "strength", // traditionalStrengthTraining
  59: "strength", // coreTraining
  63: "hiit", // highIntensityIntervalTraining
  11: "hiit", // crossTraining
  9: "climbing", // climbing
  57: "yoga", // yoga
  66: "yoga", // pilates
  41: "team_sport", // soccer
  6: "team_sport", // basketball
  23: "team_sport", // handball
  25: "team_sport", // hockey
  51: "team_sport", // volleyball
  36: "team_sport", // rugby
};

/** Health Connect ExerciseType values (see react-native-health-connect). */
const HEALTH_CONNECT: Record<number, Activity> = {
  56: "running", // RUNNING
  57: "running", // RUNNING_TREADMILL
  8: "cycling", // BIKING
  9: "indoor_cycling", // BIKING_STATIONARY
  73: "swimming", // SWIMMING_OPEN_WATER
  74: "swimming", // SWIMMING_POOL
  79: "walking", // WALKING
  37: "hiking", // HIKING
  53: "rowing", // ROWING
  54: "rowing", // ROWING_MACHINE
  70: "strength", // STRENGTH_TRAINING
  81: "strength", // WEIGHTLIFTING
  13: "strength", // CALISTHENICS
  36: "hiit", // HIGH_INTENSITY_INTERVAL_TRAINING
  10: "hiit", // BOOT_CAMP
  51: "climbing", // ROCK_CLIMBING
  83: "yoga", // YOGA
  48: "yoga", // PILATES
  64: "team_sport", // SOCCER
  5: "team_sport", // BASKETBALL
  35: "team_sport", // HANDBALL
  38: "team_sport", // ICE_HOCKEY
  78: "team_sport", // VOLLEYBALL
  55: "team_sport", // RUGBY
  // SKIING (61) does not say alpine, cross-country or touring: it stays "other" and counts.
};

export function healthKitActivity(type: number, indoor: boolean): Activity {
  const activity = HEALTHKIT[type] ?? "other";
  return activity === "cycling" && indoor ? "indoor_cycling" : activity;
}

export function healthConnectActivity(type: number): Activity {
  return HEALTH_CONNECT[type] ?? "other";
}
