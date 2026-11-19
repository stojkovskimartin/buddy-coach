/**
 * Apple Health (HealthKit) on iPhone: Apple Watch and every app that writes workouts there
 * (Garmin, WHOOP, Polar, Huawei, Xiaomi, Strava, ...). Read-only.
 */
import { healthKitActivity } from "./activityMapping";
import type { Availability, HealthSource, RawWorkout, ReadResult } from "./types";
import { toKilocalories, toKilometers, toMinutes } from "./units";

type HealthKit = typeof import("@kingstinct/react-native-healthkit");

/** The native module is missing in Expo Go; health sync then reports "unavailable". */
function load(): HealthKit | null {
  try {
    return require("@kingstinct/react-native-healthkit") as HealthKit;
  } catch {
    return null;
  }
}

const READ = ["HKWorkoutTypeIdentifier", "HKQuantityTypeIdentifierHeartRate"] as const;

export function appleHealthSource(healthKit: HealthKit | null = load()): HealthSource {
  return {
    platform: "apple_health",

    async availability(): Promise<Availability> {
      return healthKit?.isHealthDataAvailable() ? "available" : "unavailable";
    },

    async connect(): Promise<boolean> {
      if (!healthKit) return false;
      // HealthKit never tells whether reading was allowed; a denial simply looks like no data.
      return healthKit.requestAuthorization({ toRead: READ });
    },

    async readSince(cursor: string | null, since: Date): Promise<ReadResult> {
      if (!healthKit) return { workouts: [], nextCursor: cursor };
      const result = await healthKit.queryWorkoutSamplesWithAnchor({
        limit: 0,
        ...(cursor ? { anchor: cursor } : { filter: { date: { startDate: since } } }),
      });
      const workouts: RawWorkout[] = [];
      for (const proxy of result.workouts) {
        const sample = proxy.toJSON();
        const heartRate = await proxy.getStatistic("HKQuantityTypeIdentifierHeartRate", "count/min");
        const minutes = toMinutes(sample.duration.quantity, sample.duration.unit);
        if (minutes !== null) {
          const indoor = sample.metadata?.HKIndoorWorkout === true;
          workouts.push({
            external_id: sample.uuid,
            activity: healthKitActivity(sample.workoutActivityType, indoor),
            started_at: new Date(sample.startDate).toISOString(),
            duration_min: minutes,
            distance_km: sample.totalDistance
              ? toKilometers(sample.totalDistance.quantity, sample.totalDistance.unit)
              : null,
            kcal: sample.totalEnergyBurned
              ? toKilocalories(sample.totalEnergyBurned.quantity, sample.totalEnergyBurned.unit)
              : null,
            avg_hr: heartRate?.averageQuantity?.quantity ?? null,
            max_hr: heartRate?.maximumQuantity?.quantity ?? null,
          });
        }
        proxy.dispose();
      }
      return { workouts, nextCursor: result.newAnchor };
    },
  };
}
