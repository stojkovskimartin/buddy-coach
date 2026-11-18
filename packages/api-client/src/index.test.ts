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

  it("logout clears tokens and revokes the refresh token", async () => {
    const api = fakeApi({ "POST /api/v1/auth/logout": () => new Response(null, { status: 204 }) });
    const store = memoryTokenStore(tokens(1));
    const client = new BuddyClient({ baseUrl: BASE, tokens: store, fetch: api.fetch });

    await client.logout();

    expect(await store.get()).toBeNull();
    expect(await api.calls[0]?.json()).toEqual({ refresh_token: "refresh-1" });
  });
});
