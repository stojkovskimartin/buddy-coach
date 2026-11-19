import { appleHealthSource } from "../src/health/appleHealth";
import { healthConnectSource } from "../src/health/healthConnect";

const SINCE = new Date("2026-10-20T00:00:00Z");

describe("appleHealthSource", () => {
  function fakeHealthKit(overrides: Record<string, unknown> = {}) {
    const proxy = {
      toJSON: () => ({
        uuid: "HK-1",
        workoutActivityType: 13,
        startDate: new Date("2026-11-18T07:00:00Z"),
        duration: { quantity: 3600, unit: "s" },
        totalDistance: { quantity: 30000, unit: "meters" },
        totalEnergyBurned: { quantity: 800, unit: "kcal" },
        metadata: { HKIndoorWorkout: true },
      }),
      getStatistic: jest.fn().mockResolvedValue({
        averageQuantity: { quantity: 140, unit: "count/min" },
        maximumQuantity: { quantity: 165, unit: "count/min" },
      }),
      dispose: jest.fn(),
    };
    return {
      proxy,
      module: {
        isHealthDataAvailable: () => true,
        requestAuthorization: jest.fn().mockResolvedValue(true),
        queryWorkoutSamplesWithAnchor: jest.fn().mockResolvedValue({
          workouts: [proxy],
          deletedSamples: [],
          newAnchor: "anchor-2",
        }),
        ...overrides,
      },
    };
  }

  it("asks to read workouts and heart rate only", async () => {
    const { module } = fakeHealthKit();
    await appleHealthSource(module as never).connect();
    expect(module.requestAuthorization).toHaveBeenCalledWith({
      toRead: ["HKWorkoutTypeIdentifier", "HKQuantityTypeIdentifierHeartRate"],
    });
  });

  it("reads a window first, then from the anchor, and converts units", async () => {
    const { module, proxy } = fakeHealthKit();
    const source = appleHealthSource(module as never);

    const first = await source.readSince(null, SINCE);
    expect(module.queryWorkoutSamplesWithAnchor).toHaveBeenLastCalledWith({
      limit: 0,
      filter: { date: { startDate: SINCE } },
    });
    expect(first).toEqual({
      nextCursor: "anchor-2",
      workouts: [
        {
          external_id: "HK-1",
          activity: "indoor_cycling",
          started_at: "2026-11-18T07:00:00.000Z",
          duration_min: 60,
          distance_km: 30,
          kcal: 800,
          avg_hr: 140,
          max_hr: 165,
        },
      ],
    });
    expect(proxy.dispose).toHaveBeenCalled();

    await source.readSince("anchor-2", SINCE);
    expect(module.queryWorkoutSamplesWithAnchor).toHaveBeenLastCalledWith({ limit: 0, anchor: "anchor-2" });
  });

  it("releases every native workout object even when a statistic query fails", async () => {
    const { module, proxy } = fakeHealthKit();
    const second = { ...proxy, dispose: jest.fn() };
    proxy.getStatistic.mockRejectedValueOnce(new Error("HealthKit busy"));
    module.queryWorkoutSamplesWithAnchor.mockResolvedValueOnce({
      workouts: [proxy, second],
      deletedSamples: [],
      newAnchor: "a",
    });
    await expect(appleHealthSource(module as never).readSince(null, SINCE)).rejects.toThrow("busy");
    expect(proxy.dispose).toHaveBeenCalled();
    expect(second.dispose).toHaveBeenCalled();
  });

  it("is unavailable without the native module (Expo Go)", async () => {
    const source = appleHealthSource(null);
    expect(await source.availability()).toBe("unavailable");
    expect(await source.connect()).toBe(false);
  });
});

describe("healthConnectSource", () => {
  const session = (id: string) => ({
    metadata: { id, dataOrigin: "com.garmin.android.apps.connectmobile" },
    exerciseType: 56,
    startTime: "2026-11-18T07:00:00Z",
    endTime: "2026-11-18T07:45:00Z",
  });

  function fakeHealthConnect(overrides: Record<string, unknown> = {}) {
    return {
      SdkAvailabilityStatus: {
        SDK_UNAVAILABLE: 1,
        SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED: 2,
        SDK_AVAILABLE: 3,
      },
      getSdkStatus: jest.fn().mockResolvedValue(3),
      initialize: jest.fn().mockResolvedValue(true),
      requestPermission: jest.fn().mockResolvedValue([{ accessType: "read", recordType: "ExerciseSession" }]),
      readRecords: jest
        .fn()
        .mockResolvedValueOnce({ records: [session("S1")], pageToken: "p2" })
        .mockResolvedValueOnce({ records: [session("S2")], pageToken: "" }),
      getChanges: jest.fn().mockResolvedValue({
        upsertionChanges: [],
        deletionChanges: [],
        nextChangesToken: "token-1",
        changesTokenExpired: false,
        hasMore: false,
      }),
      aggregateRecord: jest.fn(async ({ recordType }: { recordType: string }) => {
        if (recordType === "HeartRate") return { BPM_AVG: 152, BPM_MAX: 171, BPM_MIN: 90, MEASUREMENTS_COUNT: 300 };
        if (recordType === "Distance") return { DISTANCE: { inKilometers: 9.1 } };
        throw Object.assign(new Error("permission not granted"), { code: "PERMISSION_ERROR" });
      }),
      ...overrides,
    };
  }

  it("reports when Health Connect needs an update", async () => {
    const hc = fakeHealthConnect({ getSdkStatus: jest.fn().mockResolvedValue(2) });
    expect(await healthConnectSource(hc as never).availability()).toBe("update_required");
  });

  it("first sync takes a token, pages through the window (empty page token ends) and aggregates metrics", async () => {
    const hc = fakeHealthConnect();
    const result = await healthConnectSource(hc as never).readSince(null, SINCE);

    expect(hc.getChanges).toHaveBeenCalledWith({ recordTypes: ["ExerciseSession"] });
    expect(hc.readRecords).toHaveBeenCalledTimes(2);
    expect(result.nextCursor).toBe("token-1");
    expect(result.workouts.map((w) => w.external_id)).toEqual(["S1", "S2"]);
    expect(result.workouts[0]).toMatchObject({
      activity: "running",
      duration_min: 45,
      avg_hr: 152,
      max_hr: 171,
      distance_km: 9.1,
      kcal: null, // no calories permission: the field stays empty
    });
    expect(hc.aggregateRecord).toHaveBeenCalledWith(
      expect.objectContaining({ dataOriginFilter: ["com.garmin.android.apps.connectmobile"] }),
    );
  });

  it("fails the sync on errors other than a missing permission", async () => {
    const hc = fakeHealthConnect({
      aggregateRecord: jest.fn().mockRejectedValue(Object.assign(new Error("busy"), { code: "SERVICE_UNAVAILABLE" })),
    });
    await expect(healthConnectSource(hc as never).readSince(null, SINCE)).rejects.toThrow("busy");

    const denied = fakeHealthConnect({
      aggregateRecord: jest.fn().mockRejectedValue(Object.assign(new Error("no"), { code: "PERMISSION_ERROR" })),
    });
    const result = await healthConnectSource(denied as never).readSince(null, SINCE);
    expect(result.workouts[0]).toMatchObject({ avg_hr: null, distance_km: null, kcal: null });
  });

  it("follows the changes token and re-reads the window when it expired", async () => {
    const changes = fakeHealthConnect({
      getChanges: jest.fn().mockResolvedValue({
        upsertionChanges: [{ record: { recordType: "ExerciseSession", ...session("S3") } }],
        deletionChanges: [],
        nextChangesToken: "token-2",
        changesTokenExpired: false,
        hasMore: false,
      }),
    });
    const next = await healthConnectSource(changes as never).readSince("token-1", SINCE);
    expect(next.workouts.map((w) => w.external_id)).toEqual(["S3"]);
    expect(next.nextCursor).toBe("token-2");
    expect(changes.readRecords).not.toHaveBeenCalled();

    const expired = fakeHealthConnect({
      getChanges: jest
        .fn()
        .mockResolvedValueOnce({ upsertionChanges: [], deletionChanges: [], nextChangesToken: "", changesTokenExpired: true, hasMore: false })
        .mockResolvedValueOnce({ upsertionChanges: [], deletionChanges: [], nextChangesToken: "fresh", changesTokenExpired: false, hasMore: false }),
    });
    const reread = await healthConnectSource(expired as never).readSince("old", SINCE);
    expect(reread.nextCursor).toBe("fresh");
    expect(reread.workouts).toHaveLength(2);
  });
});
