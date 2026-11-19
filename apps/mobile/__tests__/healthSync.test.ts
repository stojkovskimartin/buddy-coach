import { HealthSync, type SyncState } from "../src/health/sync";
import type { HealthSource, ReadResult, WeightReadResult } from "../src/health/types";

const NOW = new Date("2026-11-19T08:00:00Z");

function memoryState(initial: Record<string, string> = {}): SyncState & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    remove: async (k) => void data.delete(k),
  };
}

function source(
  read: (cursor: string | null, since: Date) => Promise<ReadResult>,
  readWeights: (cursor: string | null, since: Date) => Promise<WeightReadResult> = async () => ({
    weights: [],
    nextCursor: null,
  }),
): HealthSource {
  return {
    platform: "health_connect",
    availability: async () => "available",
    connect: jest.fn().mockResolvedValue(true),
    readSince: jest.fn(read),
    readWeightsSince: jest.fn(readWeights),
    needsWeightAccess: jest.fn().mockResolvedValue(false),
  };
}

const run = (id: string) => ({
  external_id: id,
  activity: "running" as const,
  started_at: "2026-11-18T07:00:00.000Z",
  duration_min: 40,
});

const CURSOR = "buddy-coach.health.health_connect.cursor";
const WEIGHT_CURSOR = "buddy-coach.health.health_connect.weight_cursor";

describe("HealthSync", () => {
  it("first sync reads the last 30 days and saves the cursor after the server accepted", async () => {
    const src = source(async () => ({ workouts: [run("1"), run("2")], nextCursor: "token-1" }));
    const api = { importWorkouts: jest.fn().mockResolvedValue({ created: 2, updated: 0 }), importWeights: jest.fn() };
    const state = memoryState();
    const sync = new HealthSync(src, api, state, () => NOW);

    const outcome = await sync.sync();

    expect(src.readSince).toHaveBeenCalledWith(null, new Date("2026-10-20T08:00:00Z"));
    expect(api.importWorkouts.mock.calls[0][0]).toHaveLength(2);
    expect(outcome).toMatchObject({ created: 2, updated: 0, skipped: 0 });
    expect(state.data.get(CURSOR)).toBe("token-1");
  });

  it("keeps the old cursor when the server refuses, so the next sync repeats", async () => {
    const src = source(async () => ({ workouts: [run("1")], nextCursor: "token-2" }));
    const api = { importWorkouts: jest.fn().mockRejectedValue(new Error("422")), importWeights: jest.fn() };
    const state = memoryState({ [CURSOR]: "token-1" });
    const sync = new HealthSync(src, api, state, () => NOW);

    await expect(sync.sync()).rejects.toThrow("422");
    expect(state.data.get(CURSOR)).toBe("token-1");
    expect(src.readSince).toHaveBeenCalledWith("token-1", expect.any(Date));
  });

  it("skips invalid workouts and sends the rest", async () => {
    const src = source(async () => ({
      workouts: [run("ok"), { ...run("future"), started_at: "2026-11-20T08:00:00Z" }],
      nextCursor: "t",
    }));
    const api = { importWorkouts: jest.fn().mockResolvedValue({ created: 1, updated: 0 }), importWeights: jest.fn() };
    const outcome = await new HealthSync(src, api, memoryState(), () => NOW).sync();
    expect(outcome.skipped).toBe(1);
    expect(api.importWorkouts.mock.calls[0][0].map((w: { external_id: string }) => w.external_id)).toEqual(["ok"]);
  });

  it("sends nothing when there is nothing new", async () => {
    const api = { importWorkouts: jest.fn(), importWeights: jest.fn() };
    await new HealthSync(source(async () => ({ workouts: [], nextCursor: "t" })), api, memoryState(), () => NOW).sync();
    expect(api.importWorkouts).not.toHaveBeenCalled();
  });

  it("runs one sync at a time", async () => {
    let finish: (r: ReadResult) => void = () => undefined;
    const src = source(() => new Promise((resolve) => (finish = resolve)));
    const api = { importWorkouts: jest.fn().mockResolvedValue({ created: 1, updated: 0 }), importWeights: jest.fn() };
    const sync = new HealthSync(src, api, memoryState(), () => NOW);

    const first = sync.sync();
    const second = sync.sync();
    while ((src.readSince as jest.Mock).mock.calls.length === 0) await Promise.resolve();
    finish({ workouts: [run("1")], nextCursor: "t" });

    expect(await first).toBe(await second);
    expect(src.readSince).toHaveBeenCalledTimes(1);
  });

  it("disconnect waits for a running sync, so nothing is written afterwards", async () => {
    let finish: (r: ReadResult) => void = () => undefined;
    const src = source(() => new Promise((resolve) => (finish = resolve)));
    const state = memoryState({ "buddy-coach.health.health_connect.connected": "true" });
    const sync = new HealthSync(src, { importWorkouts: jest.fn().mockResolvedValue({ created: 1, updated: 0 }), importWeights: jest.fn() }, state, () => NOW);

    const running = sync.sync();
    while ((src.readSince as jest.Mock).mock.calls.length === 0) await Promise.resolve();
    const stopped = sync.disconnect();
    finish({ workouts: [run("1")], nextCursor: "t" });
    await running;
    await stopped;
    expect(state.data.size).toBe(0);
  });

  it("sends smart-scale weights from their own cursor and counts the new ones", async () => {
    const reading = { external_id: "W1", measured_at: "2026-11-19T06:30:00.000Z", weight_kg: 77.6 };
    const src = source(
      async () => ({ workouts: [], nextCursor: "t" }),
      async () => ({ weights: [reading], nextCursor: "w-2" }),
    );
    const api = {
      importWorkouts: jest.fn(),
      importWeights: jest.fn().mockResolvedValue({ created: 1, updated: 0, skipped: 0 }),
    };
    const state = memoryState({ [WEIGHT_CURSOR]: "w-1" });

    const outcome = await new HealthSync(src, api, state, () => NOW).sync();

    expect(src.readWeightsSince).toHaveBeenCalledWith("w-1", new Date("2026-10-20T08:00:00Z"));
    expect(api.importWeights).toHaveBeenCalledWith([{ ...reading, source: "health_connect" }]);
    expect(outcome.weights).toBe(1);
    expect(state.data.get(WEIGHT_CURSOR)).toBe("w-2");
  });

  it("keeps the weight cursor when the server refuses the weights", async () => {
    const reading = { external_id: "W1", measured_at: "2026-11-19T06:30:00.000Z", weight_kg: 77.6 };
    const src = source(
      async () => ({ workouts: [], nextCursor: "t" }),
      async () => ({ weights: [reading], nextCursor: "w-2" }),
    );
    const api = { importWorkouts: jest.fn(), importWeights: jest.fn().mockRejectedValue(new Error("500")) };
    const state = memoryState({ [WEIGHT_CURSOR]: "w-1" });
    await expect(new HealthSync(src, api, state, () => NOW).sync()).rejects.toThrow("500");
    expect(state.data.get(WEIGHT_CURSOR)).toBe("w-1");
  });

  it("connect remembers access; disconnect forgets the cursors", async () => {
    const state = memoryState();
    const sync = new HealthSync(
      source(
        async () => ({ workouts: [], nextCursor: "t" }),
        async () => ({ weights: [], nextCursor: "w" }),
      ),
      { importWorkouts: jest.fn(), importWeights: jest.fn() },
      state,
      () => NOW,
    );
    expect(await sync.isConnected()).toBe(false);
    await sync.connect();
    await sync.sync();
    expect(await sync.isConnected()).toBe(true);
    expect(state.data.get(WEIGHT_CURSOR)).toBe("w");
    await sync.disconnect();
    expect(await sync.isConnected()).toBe(false);
    expect(state.data.size).toBe(0);
  });
});
