import { describe, expect, it, vi } from "vitest";

import { ApiError, BuddyClient, memoryTokenStore, type TokenPair } from "./index";

const BASE = "http://api.test";
const tokens = (n: number): TokenPair => ({
  access_token: `access-${n}`,
  refresh_token: `refresh-${n}`,
  token_type: "bearer",
  expires_in: 900,
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A fake API: routes by method + path, records calls. */
function fakeApi(handlers: Record<string, (req: Request) => Response | Promise<Response>>) {
  const calls: Request[] = [];
  const fetch = vi.fn(async (input: Request) => {
    calls.push(input.clone());
    const key = `${input.method} ${new URL(input.url).pathname}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`unexpected ${key}`);
    return handler(input);
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

describe("BuddyClient", () => {
  it("logs in and stores tokens", async () => {
    const api = fakeApi({ "POST /api/v1/auth/login": () => json(200, tokens(1)) });
    const store = memoryTokenStore();
    const client = new BuddyClient({ baseUrl: BASE, tokens: store, fetch: api.fetch });

    await client.login("a@b.ch", "long-password");

    expect(await store.get()).toEqual(tokens(1));
    expect(api.calls[0]?.headers.get("Authorization")).toBeNull();
  });

  it("sends the bearer token on protected calls", async () => {
    const api = fakeApi({ "GET /api/v1/goals": () => json(200, []) });
    const client = new BuddyClient({
      baseUrl: BASE,
      tokens: memoryTokenStore(tokens(1)),
      fetch: api.fetch,
    });

    await client.listGoals();

    expect(api.calls[0]?.headers.get("Authorization")).toBe("Bearer access-1");
  });

  it("refreshes once on 401 and retries the request", async () => {
    let goalCalls = 0;
    const api = fakeApi({
      "GET /api/v1/goals": (req) => {
        goalCalls += 1;
        return req.headers.get("Authorization") === "Bearer access-2"
          ? json(200, [])
          : json(401, { code: "unauthenticated", detail: "expired" });
      },
      "POST /api/v1/auth/refresh": () => json(200, tokens(2)),
    });
    const store = memoryTokenStore(tokens(1));
    const client = new BuddyClient({ baseUrl: BASE, tokens: store, fetch: api.fetch });

    await expect(client.listGoals()).resolves.toEqual([]);
    expect(goalCalls).toBe(2);
    expect((await store.get())?.access_token).toBe("access-2");
  });

  it("shares one refresh between parallel 401s", async () => {
    let refreshCalls = 0;
    const api = fakeApi({
      "GET /api/v1/goals": (req) =>
        req.headers.get("Authorization") === "Bearer access-2"
          ? json(200, [])
          : json(401, { code: "unauthenticated", detail: "expired" }),
      "POST /api/v1/auth/refresh": async () => {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return json(200, tokens(2));
      },
    });
    const client = new BuddyClient({
      baseUrl: BASE,
      tokens: memoryTokenStore(tokens(1)),
      fetch: api.fetch,
    });

    await Promise.all([client.listGoals(), client.listGoals(), client.listGoals()]);

    expect(refreshCalls).toBe(1);
  });

  it("clears tokens and reports expiry when refresh fails", async () => {
    const api = fakeApi({
      "GET /api/v1/users/me": () => json(401, { code: "unauthenticated", detail: "expired" }),
      "POST /api/v1/auth/refresh": () => json(401, { code: "unauthenticated", detail: "revoked" }),
    });
    const store = memoryTokenStore(tokens(1));
    const onSessionExpired = vi.fn();
    const client = new BuddyClient({
      baseUrl: BASE,
      tokens: store,
      fetch: api.fetch,
      onSessionExpired,
    });

    await expect(client.me()).rejects.toBeInstanceOf(ApiError);
    expect(onSessionExpired).toHaveBeenCalledOnce();
    expect(await store.get()).toBeNull();
  });

  it("returns null profile before onboarding", async () => {
    const api = fakeApi({
      "GET /api/v1/profile": () => json(404, { code: "not_found", detail: "Profile not found." }),
    });
    const client = new BuddyClient({
      baseUrl: BASE,
      tokens: memoryTokenStore(tokens(1)),
      fetch: api.fetch,
    });

    expect(await client.getProfile()).toBeNull();
  });

  it("returns today's nutrition targets, or null before onboarding", async () => {
    const targets = {
      day: "2026-11-19",
      goal: "maintain",
      kcal: 2700,
      protein_g: 130,
      carbs_g: 360,
      fat_g: 80,
      maintenance_kcal: 2700,
      floor_applied: false,
      training_kcal_estimated: true,
      reasons: [],
    };
    let onboarded = false;
    const api = fakeApi({
      "GET /api/v1/nutrition/targets/today": () =>
        onboarded ? json(200, targets) : json(404, { code: "not_found", detail: "No profile." }),
    });
    const client = new BuddyClient({
      baseUrl: BASE,
      tokens: memoryTokenStore(tokens(1)),
      fetch: api.fetch,
    });

    expect(await client.getTodayTargets()).toBeNull();
    onboarded = true;
    expect((await client.getTodayTargets())?.kcal).toBe(2700);
  });

  it("imports workouts in one batch", async () => {
    const api = fakeApi({
      "POST /api/v1/workouts/import": () => json(200, { created: 1, updated: 0 }),
    });
    const client = new BuddyClient({
      baseUrl: BASE,
      tokens: memoryTokenStore(tokens(1)),
      fetch: api.fetch,
    });
    const run = {
      source: "apple_health" as const,
      external_id: "A1",
      activity: "running" as const,
      started_at: "2026-11-18T07:00:00.000Z",
      duration_min: 50,
    };

    expect(await client.importWorkouts([run])).toEqual({ created: 1, updated: 0 });
    expect(await api.calls[0]?.json()).toEqual({ workouts: [run] });
  });

  describe("weights", () => {
    const authed = (routes: Parameters<typeof fakeApi>[0]) => {
      const api = fakeApi(routes);
      const client = new BuddyClient({
        baseUrl: BASE,
        tokens: memoryTokenStore(tokens(1)),
        fetch: api.fetch,
      });
      return { api, client };
    };

    it("logs and lists with a range", async () => {
      const weight = {
        id: "w1",
        source: "manual",
        measured_at: "2026-11-19T06:30:00Z",
        day: "2026-11-19",
        weight_kg: 77.4,
      };
      const { api, client } = authed({
        "POST /api/v1/body/weights": () => json(201, weight),
        "GET /api/v1/body/weights": () => json(200, { weights: [weight], trend: [] }),
      });
      expect(await client.logWeight({ weight_kg: 77.4 })).toEqual(weight);
      expect(await api.calls[0]?.json()).toEqual({ weight_kg: 77.4 });

      expect((await client.listWeights({ from: "2026-08-22" })).weights).toHaveLength(1);
      expect(new URL(api.calls[1]!.url).searchParams.get("from")).toBe("2026-08-22");
    });

    it("imports smart-scale weights in one batch", async () => {
      const { api, client } = authed({
        "POST /api/v1/body/weights/import": () => json(200, { created: 1, updated: 0, skipped: 0 }),
      });
      const reading = {
        source: "health_connect" as const,
        external_id: "hc-1",
        measured_at: "2026-11-19T06:30:00Z",
        weight_kg: 77.6,
      };
      expect(await client.importWeights([reading])).toEqual({ created: 1, updated: 0, skipped: 0 });
      expect(await api.calls[0]?.json()).toEqual({ weights: [reading] });
    });

    it("deletes, and reports a missing weight", async () => {
      const { client } = authed({
        "DELETE /api/v1/body/weights/w1": () => new Response(null, { status: 204 }),
        "DELETE /api/v1/body/weights/gone": () =>
          json(404, { code: "not_found", detail: "Weight not found." }),
      });
      await expect(client.deleteWeight("w1")).resolves.toBeUndefined();
      await expect(client.deleteWeight("gone")).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("food diary", () => {
    it("adds, reads a day and deletes", async () => {
      const day = { day: "2026-11-19", entries: [], totals: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 } };
      const api = fakeApi({
        "POST /api/v1/meals/entries": () => json(201, { id: "m1" }),
        "GET /api/v1/meals/entries": () => json(200, day),
        "DELETE /api/v1/meals/entries/m1": () => new Response(null, { status: 204 }),
      });
      const client = new BuddyClient({ baseUrl: BASE, tokens: memoryTokenStore(tokens(1)), fetch: api.fetch });
      const entry = { meal: "lunch" as const, name: "Rice", grams: 150, kcal: 195, protein_g: 4, carbs_g: 42, fat_g: 0.5 };
      await client.logMeal(entry);
      expect(await api.calls[0]?.json()).toEqual(entry);
      expect(await client.getMealDay("2026-11-18")).toEqual(day);
      expect(new URL(api.calls[1]!.url).searchParams.get("day")).toBe("2026-11-18");
      await client.getMealDay();
      expect(new URL(api.calls[2]!.url).searchParams.has("day")).toBe(false);
      await expect(client.deleteMeal("m1")).resolves.toBeUndefined();
    });
  });

  it("reads daily food totals and the training load with their ranges", async () => {
    const api = fakeApi({
      "GET /api/v1/meals/daily": () => json(200, []),
      "GET /api/v1/training/load": () => json(200, { days: [] }),
    });
    const client = new BuddyClient({ baseUrl: BASE, tokens: memoryTokenStore(tokens(1)), fetch: api.fetch });
    await client.listDailyTotals({ from: "2026-10-23", to: "2026-11-19" });
    expect(new URL(api.calls[0]!.url).searchParams.get("from")).toBe("2026-10-23");
    await client.getTrainingLoad(90);
    expect(new URL(api.calls[1]!.url).searchParams.get("days")).toBe("90");
  });

  it("uploads a photo as its raw bytes and reads its image as a blob", async () => {
    const photo = { id: "p1", kind: "meal", day: "2026-11-19", width: 1280, height: 960, created_at: "x" };
    const api = fakeApi({
      "POST /api/v1/photos": () => json(201, photo),
      "GET /api/v1/photos/p1/image": () => new Response(new Blob(["jpeg"], { type: "image/jpeg" })),
      "DELETE /api/v1/photos/p1": () => new Response(null, { status: 204 }),
      "GET /api/v1/photos": () => json(200, [photo]),
    });
    const client = new BuddyClient({ baseUrl: BASE, tokens: memoryTokenStore(tokens(1)), fetch: api.fetch });
    const image = new Blob(["raw-png"], { type: "image/png" });

    expect(await client.uploadPhoto("meal", image)).toEqual(photo);
    const sent = api.calls[0]!;
    expect(new URL(sent.url).searchParams.get("kind")).toBe("meal");
    expect(sent.headers.get("Content-Type")).toBe("image/png");
    expect(await sent.text()).toBe("raw-png");

    expect(await (await client.photoImage("p1")).text()).toBe("jpeg");
    expect(new URL(api.calls[1]!.url).searchParams.get("size")).toBe("thumb");
    expect(await client.listPhotos({ kind: "meal" })).toHaveLength(1);
    await expect(client.deletePhoto("p1")).resolves.toBeUndefined();
  });

  it("uploads a FIT file and reads where data comes from", async () => {
    const api = fakeApi({
      "POST /api/v1/workouts/fit": () => json(200, { created: 1, updated: 0 }),
      "GET /api/v1/workouts/sources": () => json(200, [{ source: "fit_file", workouts: 1, last_at: "x" }]),
      "GET /api/v1/body/weights/sources": () => json(200, []),
    });
    const client = new BuddyClient({ baseUrl: BASE, tokens: memoryTokenStore(tokens(1)), fetch: api.fetch });
    expect(await client.uploadFit(new Blob(["fit-bytes"]))).toEqual({ created: 1, updated: 0 });
    expect(api.calls[0]!.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(await api.calls[0]!.text()).toBe("fit-bytes");
    expect(await client.workoutSources()).toHaveLength(1);
    expect(await client.weightSources()).toEqual([]);
  });

  describe("check-ins", () => {
    const checkin = {
      day: "2026-11-18",
      sleep_quality: 4,
      soreness: 3,
      mood: 5,
      sleep_hours: null,
      hrv_ms: null,
      resting_hr: null,
      pain: false,
      readiness: { score: 72, level: "green", limiting_factors: [] },
    };

    it("returns null when today's check-in is missing", async () => {
      const api = fakeApi({
        "GET /api/v1/checkins/today": () => json(404, { code: "not_found", detail: "None yet." }),
      });
      const client = new BuddyClient({
        baseUrl: BASE,
        tokens: memoryTokenStore(tokens(1)),
        fetch: api.fetch,
      });
      expect(await client.getTodayCheckin()).toBeNull();
    });

    it("saves a new check-in (201) and returns its readiness", async () => {
      const api = fakeApi({ "PUT /api/v1/checkins/2026-11-18": () => json(201, checkin) });
      const client = new BuddyClient({
        baseUrl: BASE,
        tokens: memoryTokenStore(tokens(1)),
        fetch: api.fetch,
      });

      const saved = await client.saveCheckin("2026-11-18", { sleep_quality: 4, soreness: 3, mood: 5 });

      expect(saved.readiness.score).toBe(72);
      expect(await api.calls[0]?.json()).toEqual({ sleep_quality: 4, soreness: 3, mood: 5 });
    });

    it("saves today's check-in without sending a date", async () => {
      const api = fakeApi({ "PUT /api/v1/checkins/today": () => json(201, checkin) });
      const client = new BuddyClient({
        baseUrl: BASE,
        tokens: memoryTokenStore(tokens(1)),
        fetch: api.fetch,
      });

      expect((await client.saveTodayCheckin({ sleep_quality: 4, soreness: 3, mood: 5 })).day).toBe(
        "2026-11-18",
      );
    });

    it("lists check-ins with the from/to range", async () => {
      const api = fakeApi({ "GET /api/v1/checkins": () => json(200, [checkin]) });
      const client = new BuddyClient({
        baseUrl: BASE,
        tokens: memoryTokenStore(tokens(1)),
        fetch: api.fetch,
      });

      expect(await client.listCheckins({ from: "2026-11-01", to: "2026-11-18" })).toHaveLength(1);
      const url = new URL(api.calls[0]!.url);
      expect(url.searchParams.get("from")).toBe("2026-11-01");
      expect(url.searchParams.get("to")).toBe("2026-11-18");
    });
  });

  it("turns problem details into ApiError", async () => {
    const api = fakeApi({
      "POST /api/v1/auth/register": () =>
        json(409, { code: "conflict", detail: "An account with this email already exists." }),
    });
    const client = new BuddyClient({ baseUrl: BASE, tokens: memoryTokenStore(), fetch: api.fetch });

    const error = await client.register("a@b.ch", "long-password").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "conflict" });
  });

  it("retries a POST with its body after refreshing", async () => {
    const bodies: unknown[] = [];
    const api = fakeApi({
      "POST /api/v1/coach/chat": async (req) => {
        bodies.push(await req.json());
        return req.headers.get("Authorization") === "Bearer access-2"
          ? json(200, { reply: "ok" })
          : json(401, { code: "unauthenticated", detail: "expired" });
      },
      "POST /api/v1/auth/refresh": () => json(200, tokens(2)),
    });
    const client = new BuddyClient({
      baseUrl: BASE,
      tokens: memoryTokenStore(tokens(1)),
      fetch: api.fetch,
    });

    await expect(client.chat("hello")).resolves.toMatchObject({ reply: "ok" });
    expect(bodies).toEqual([{ message: "hello" }, { message: "hello" }]);
  });

  it("does not loop when the retried request is also rejected", async () => {
    let chatCalls = 0;
    const api = fakeApi({
      "POST /api/v1/coach/chat": () => {
        chatCalls += 1;
        return json(401, { code: "unauthenticated", detail: "still no" });
      },
      "POST /api/v1/auth/refresh": () => json(200, tokens(2)),
    });
    const client = new BuddyClient({
      baseUrl: BASE,
      tokens: memoryTokenStore(tokens(1)),
      fetch: api.fetch,
    });

    await expect(client.chat("hello")).rejects.toBeInstanceOf(ApiError);
    expect(chatCalls).toBe(2);
  });

  it.each([429, 500, 503])("keeps the session when refresh answers %i", async (status) => {
    const api = fakeApi({
      "GET /api/v1/users/me": () => json(401, { code: "unauthenticated", detail: "expired" }),
      "POST /api/v1/auth/refresh": () => json(status, { code: "x", detail: "busy" }),
    });
    const store = memoryTokenStore(tokens(1));
    const onSessionExpired = vi.fn();
    const client = new BuddyClient({ baseUrl: BASE, tokens: store, fetch: api.fetch, onSessionExpired });

    await expect(client.me()).rejects.toBeInstanceOf(ApiError);
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(await store.get()).toEqual(tokens(1));
  });

  it("keeps the session when the network fails during refresh", async () => {
    const api = fakeApi({
      "GET /api/v1/users/me": () => json(401, { code: "unauthenticated", detail: "expired" }),
      "POST /api/v1/auth/refresh": () => {
        throw new TypeError("network down");
      },
    });
    const store = memoryTokenStore(tokens(1));
    const client = new BuddyClient({ baseUrl: BASE, tokens: store, fetch: api.fetch });

    await expect(client.me()).rejects.toBeInstanceOf(ApiError);
    expect(await store.get()).toEqual(tokens(1));
  });

  it("logout clears tokens and revokes the refresh token", async () => {
    const api = fakeApi({ "POST /api/v1/auth/logout": () => new Response(null, { status: 204 }) });
    const store = memoryTokenStore(tokens(1));
    const client = new BuddyClient({ baseUrl: BASE, tokens: store, fetch: api.fetch });

    await client.logout();

    expect(await store.get()).toBeNull();
    expect(await api.calls[0]?.json()).toEqual({ refresh_token: "refresh-1" });
  });
});
