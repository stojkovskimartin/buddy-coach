/**
 * Android Health Connect: Samsung, Google/Fitbit, Xiaomi/Zepp, Garmin and other apps that write
 * exercise sessions there, and smart scales that write weights. Read-only; sessions hold no metrics, so heart rate, distance and
 * calories are aggregated from the session's own app within its time range.
 */
import { healthConnectActivity } from "./activityMapping";
import type {
  Availability,
  HealthSource,
  RawWeight,
  RawWorkout,
  ReadResult,
  WeightReadResult,
} from "./types";

type HealthConnect = typeof import("react-native-health-connect");

function load(): HealthConnect | null {
  try {
    return require("react-native-health-connect") as HealthConnect;
  } catch {
    return null;
  }
}

const PERMISSIONS = [
  { accessType: "read", recordType: "ExerciseSession" },
  { accessType: "read", recordType: "HeartRate" },
  { accessType: "read", recordType: "Distance" },
  { accessType: "read", recordType: "ActiveCaloriesBurned" },
  { accessType: "read", recordType: "Weight" },
] as const;

const PAGE_SIZE = 200;

interface WeightRecord {
  metadata?: { id?: string };
  time: string;
  weight: { inKilograms: number };
}

interface Session {
  metadata?: { id?: string; dataOrigin?: string };
  exerciseType: number;
  startTime: string;
  endTime: string;
}

export function healthConnectSource(hc: HealthConnect | null = load()): HealthSource {
  async function ready(): Promise<HealthConnect | null> {
    if (!hc) return null;
    return (await hc.initialize()) ? hc : null;
  }

  async function aggregate(api: HealthConnect, session: Session): Promise<Partial<RawWorkout>> {
    const filter = {
      timeRangeFilter: {
        operator: "between" as const,
        startTime: session.startTime,
        endTime: session.endTime,
      },
      ...(session.metadata?.dataOrigin ? { dataOriginFilter: [session.metadata.dataOrigin] } : {}),
    };
    // Only a missing permission leaves a field empty; any other error fails the sync, which then
    // repeats with the same cursor instead of overwriting good values with empty ones.
    const safe = async <T,>(read: () => Promise<T>): Promise<T | null> => {
      try {
        return await read();
      } catch (error) {
        if ((error as { code?: string }).code === "PERMISSION_ERROR") return null;
        throw error;
      }
    };
    const [hr, distance, energy] = await Promise.all([
      safe(() => api.aggregateRecord({ recordType: "HeartRate", ...filter })),
      safe(() => api.aggregateRecord({ recordType: "Distance", ...filter })),
      safe(() => api.aggregateRecord({ recordType: "ActiveCaloriesBurned", ...filter })),
    ]);
    return {
      avg_hr: hr?.MEASUREMENTS_COUNT ? hr.BPM_AVG : null,
      max_hr: hr?.MEASUREMENTS_COUNT ? hr.BPM_MAX : null,
      distance_km: distance ? distance.DISTANCE.inKilometers || null : null,
      kcal: energy ? energy.ACTIVE_CALORIES_TOTAL.inKilocalories || null : null,
    };
  }

  async function toWorkout(api: HealthConnect, session: Session): Promise<RawWorkout | null> {
    const id = session.metadata?.id;
    const start = Date.parse(session.startTime);
    const end = Date.parse(session.endTime);
    if (!id || Number.isNaN(start) || Number.isNaN(end)) return null;
    return {
      external_id: id,
      activity: healthConnectActivity(session.exerciseType),
      started_at: new Date(start).toISOString(),
      duration_min: (end - start) / 60_000,
      ...(await aggregate(api, session)),
    };
  }

  type RecordType = "ExerciseSession" | "Weight";

  async function readWindow(api: HealthConnect, recordType: RecordType, since: Date): Promise<unknown[]> {
    const records: unknown[] = [];
    let pageToken: string | undefined;
    do {
      const page = await api.readRecords(recordType, {
        timeRangeFilter: { operator: "after", startTime: since.toISOString() },
        pageSize: PAGE_SIZE,
        ...(pageToken ? { pageToken } : {}),
      });
      records.push(...page.records);
      pageToken = page.pageToken || undefined; // some Android versions return "" at the end
    } while (pageToken);
    return records;
  }

  /** Records of one type changed since `cursor`, or the window after `since` on a first sync or
   * when the token expired (the server import is idempotent). */
  async function readChanged(
    api: HealthConnect,
    recordType: RecordType,
    cursor: string | null,
    since: Date,
  ): Promise<{ records: unknown[]; nextCursor: string }> {
    // A fresh token is taken BEFORE a window read, so changes made during the read come next time.
    const freshToken = async () => (await api.getChanges({ recordTypes: [recordType] })).nextChangesToken;
    if (!cursor) {
      const nextCursor = await freshToken();
      return { records: await readWindow(api, recordType, since), nextCursor };
    }
    const records: unknown[] = [];
    let token = cursor;
    let more = true;
    while (more) {
      const changes = await api.getChanges({ changesToken: token, recordTypes: [recordType] });
      if (changes.changesTokenExpired) {
        const nextCursor = await freshToken();
        return { records: await readWindow(api, recordType, since), nextCursor };
      }
      for (const change of changes.upsertionChanges) {
        if (change.record.recordType === recordType) records.push(change.record);
      }
      token = changes.nextChangesToken;
      more = changes.hasMore;
    }
    return { records, nextCursor: token };
  }

  return {
    platform: "health_connect",

    async availability(): Promise<Availability> {
      if (!hc) return "unavailable";
      const status = await hc.getSdkStatus();
      if (status === hc.SdkAvailabilityStatus.SDK_AVAILABLE) return "available";
      if (status === hc.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
        return "update_required";
      }
      return "unavailable";
    },

    async connect(): Promise<boolean> {
      const api = await ready();
      if (!api) return false;
      const granted = await api.requestPermission([...PERMISSIONS]);
      return granted.some((p) => p.recordType === "ExerciseSession");
    },

    async readSince(cursor: string | null, since: Date): Promise<ReadResult> {
      const api = await ready();
      if (!api) return { workouts: [], nextCursor: cursor };
      const { records, nextCursor } = await readChanged(api, "ExerciseSession", cursor, since);
      const sessions = records as Session[];
      // One session at a time: three aggregate calls each, without flooding Health Connect.
      const workouts: RawWorkout[] = [];
      for (const session of sessions) {
        const workout = await toWorkout(api, session);
        if (workout) workouts.push(workout);
      }
      return { workouts, nextCursor };
    },

    async needsWeightAccess(): Promise<boolean> {
      const api = await ready();
      if (!api) return false;
      const granted = await api.getGrantedPermissions();
      return !granted.some((p) => "recordType" in p && p.recordType === "Weight" && p.accessType === "read");
    },

    async readWeightsSince(cursor: string | null, since: Date): Promise<WeightReadResult> {
      const api = await ready();
      if (!api) return { weights: [], nextCursor: cursor };
      let result: { records: unknown[]; nextCursor: string };
      try {
        result = await readChanged(api, "Weight", cursor, since);
      } catch (error) {
        // Connected before weights were added: nothing to read until access is granted again.
        if ((error as { code?: string }).code === "PERMISSION_ERROR") {
          return { weights: [], nextCursor: cursor };
        }
        throw error;
      }
      const weights: RawWeight[] = [];
      for (const record of result.records as WeightRecord[]) {
        const id = record.metadata?.id;
        const time = Date.parse(record.time);
        if (id && !Number.isNaN(time)) {
          weights.push({
            external_id: id,
            measured_at: new Date(time).toISOString(),
            weight_kg: record.weight.inKilograms,
          });
        }
      }
      return { weights, nextCursor: result.nextCursor };
    },
  };
}
