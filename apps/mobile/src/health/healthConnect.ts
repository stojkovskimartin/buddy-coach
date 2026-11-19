/**
 * Android Health Connect: Samsung, Google/Fitbit, Xiaomi/Zepp, Garmin and other apps that write
 * exercise sessions there. Read-only; sessions hold no metrics, so heart rate, distance and
 * calories are aggregated from the session's own app within its time range.
 */
import { healthConnectActivity } from "./activityMapping";
import type { Availability, HealthSource, RawWorkout, ReadResult } from "./types";

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
] as const;

const PAGE_SIZE = 200;

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

  async function readWindow(api: HealthConnect, since: Date): Promise<Session[]> {
    const sessions: Session[] = [];
    let pageToken: string | undefined;
    do {
      const page = await api.readRecords("ExerciseSession", {
        timeRangeFilter: { operator: "after", startTime: since.toISOString() },
        pageSize: PAGE_SIZE,
        ...(pageToken ? { pageToken } : {}),
      });
      sessions.push(...(page.records as Session[]));
      pageToken = page.pageToken || undefined; // some Android versions return "" at the end
    } while (pageToken);
    return sessions;
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
      // A fresh token is taken BEFORE a window read, so changes made during the read come next time.
      const freshToken = async () =>
        (await api.getChanges({ recordTypes: ["ExerciseSession"] })).nextChangesToken;
      let sessions: Session[] = [];
      let nextCursor: string;
      if (cursor) {
        let token = cursor;
        let more = true;
        while (more) {
          const changes = await api.getChanges({ changesToken: token, recordTypes: ["ExerciseSession"] });
          if (changes.changesTokenExpired) {
            token = await freshToken();
            sessions = await readWindow(api, since); // idempotent on the server
            break;
          }
          for (const change of changes.upsertionChanges) {
            if (change.record.recordType === "ExerciseSession") {
              sessions.push(change.record as unknown as Session);
            }
          }
          token = changes.nextChangesToken;
          more = changes.hasMore;
        }
        nextCursor = token;
      } else {
        nextCursor = await freshToken();
        sessions = await readWindow(api, since);
      }
      // One session at a time: three aggregate calls each, without flooding Health Connect.
      const workouts: RawWorkout[] = [];
      for (const session of sessions) {
        const workout = await toWorkout(api, session);
        if (workout) workouts.push(workout);
      }
      return { workouts, nextCursor };
    },
  };
}
