/**
 * Store activity types → the server's ActivityType, written with the libraries' own constants
 * (HealthKit WorkoutActivityType, Health Connect ExerciseType). Anything not listed is "other".
 */
import type { ImportedWorkout } from "@buddy/api-client";
// The "./types" entry has the enums without loading the native module (safe in Expo Go).
import { WorkoutActivityType as HK } from "@kingstinct/react-native-healthkit/types";
import { ExerciseType as HC } from "react-native-health-connect";

export type Activity = ImportedWorkout["activity"];

const HEALTHKIT = new Map<number, Activity>([
  [HK.running, "running"],
  [HK.cycling, "cycling"],
  [HK.swimming, "swimming"],
  [HK.walking, "walking"],
  [HK.hiking, "hiking"],
  [HK.crossCountrySkiing, "cross_country_skiing"],
  [HK.downhillSkiing, "alpine_skiing"],
  [HK.rowing, "rowing"],
  [HK.functionalStrengthTraining, "strength"],
  [HK.traditionalStrengthTraining, "strength"],
  [HK.coreTraining, "strength"],
  [HK.highIntensityIntervalTraining, "hiit"],
  [HK.crossTraining, "hiit"],
  [HK.climbing, "climbing"],
  [HK.yoga, "yoga"],
  [HK.pilates, "yoga"],
  [HK.soccer, "team_sport"],
  [HK.basketball, "team_sport"],
  [HK.handball, "team_sport"],
  [HK.hockey, "team_sport"],
  [HK.volleyball, "team_sport"],
  [HK.rugby, "team_sport"],
]);

const HEALTH_CONNECT = new Map<number, Activity>([
  [HC.RUNNING, "running"],
  [HC.RUNNING_TREADMILL, "running"],
  [HC.BIKING, "cycling"],
  [HC.BIKING_STATIONARY, "indoor_cycling"],
  [HC.SWIMMING_OPEN_WATER, "swimming"],
  [HC.SWIMMING_POOL, "swimming"],
  [HC.WALKING, "walking"],
  [HC.HIKING, "hiking"],
  [HC.ROWING, "rowing"],
  [HC.ROWING_MACHINE, "rowing"],
  [HC.STRENGTH_TRAINING, "strength"],
  [HC.WEIGHTLIFTING, "strength"],
  [HC.CALISTHENICS, "strength"],
  [HC.HIGH_INTENSITY_INTERVAL_TRAINING, "hiit"],
  [HC.BOOT_CAMP, "hiit"],
  [HC.ROCK_CLIMBING, "climbing"],
  [HC.YOGA, "yoga"],
  [HC.PILATES, "yoga"],
  [HC.SOCCER, "team_sport"],
  [HC.BASKETBALL, "team_sport"],
  [HC.HANDBALL, "team_sport"],
  [HC.ICE_HOCKEY, "team_sport"],
  [HC.VOLLEYBALL, "team_sport"],
  [HC.RUGBY, "team_sport"],
  // SKIING does not say alpine, cross-country or touring: it stays "other" and still counts.
]);

export function healthKitActivity(type: number, indoor: boolean): Activity {
  const activity = HEALTHKIT.get(type) ?? "other";
  return activity === "cycling" && indoor ? "indoor_cycling" : activity;
}

export function healthConnectActivity(type: number): Activity {
  return HEALTH_CONNECT.get(type) ?? "other";
}
