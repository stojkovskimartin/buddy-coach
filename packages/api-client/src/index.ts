/**
 * Typed client for the Buddy Coach API, shared by the web and mobile apps.
 *
 * Types come from `src/generated/schema.ts`, which is generated from the backend's OpenAPI
 * contract (`pnpm api:generate`), so a backend change that breaks a client fails `tsc`.
 */
import createClient, { type Client, type Middleware } from "openapi-fetch";

import type { components, paths } from "./generated/schema";

export type { components, paths };

type Schemas = components["schemas"];
export type TokenPair = Schemas["TokenPair"];
export type User = Schemas["UserOut"];
export type ProfileIn = Schemas["ProfileIn"];
export type Profile = Schemas["ProfileOut"];
export type GoalIn = Schemas["GoalIn"];
export type Goal = Schemas["GoalOut"];
export type ChatReply = Schemas["ChatReply"];
export type CheckinIn = Schemas["CheckinIn"];
export type Checkin = Schemas["CheckinOut"];
export type Readiness = Schemas["ReadinessOut"];
export type NutritionTargets = Schemas["TargetsOut"];
export type ImportedWorkout = Schemas["ImportedWorkout"];
export type ImportResult = Schemas["ImportResult"];
export type WeightIn = Schemas["WeightIn"];
export type Weight = Schemas["WeightOut"];
export type WeightHistory = Schemas["WeightHistoryOut"];
export type ImportedWeight = Schemas["ImportedWeight"];
export type WeightImportResult = Schemas["WeightImportResult"];

/** Where the app keeps its tokens: localStorage on web, the OS keychain/keystore on mobile. */
export interface TokenStore {
  get(): Promise<TokenPair | null>;
  set(tokens: TokenPair | null): Promise<void>;
}

/** Simple in-memory store, used in tests and as a safe default. */
export function memoryTokenStore(initial: TokenPair | null = null): TokenStore {
  let tokens = initial;
  return {
    get: async () => tokens,
    set: async (next) => {
      tokens = next;
    },
  };
}

/** Error with the server's problem details (RFC 9457). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    detail: string,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

export interface BuddyClientOptions {
  baseUrl: string;
  tokens: TokenStore;
  /** Called when the session cannot be refreshed; the app should show the login screen. */
  onSessionExpired?: () => void;
  fetch?: typeof globalThis.fetch;
}

const AUTH_FREE = ["/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/refresh"];

/** The raw typed client plus convenience methods for the main flows. */
type RefreshOutcome = "refreshed" | "expired" | "unavailable";

export class BuddyClient {
  readonly raw: Client<paths>;
  private refreshing: Promise<RefreshOutcome> | null = null;
  /** Unread copies of outgoing requests, so a request with a body can be retried after 401. */
  private readonly retryCopies = new WeakMap<Request, Request>();

  constructor(private readonly options: BuddyClientOptions) {
    this.raw = createClient<paths>({
      baseUrl: options.baseUrl,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
    this.raw.use(this.authMiddleware());
  }

  async register(email: string, password: string): Promise<User> {
    return unwrap(await this.raw.POST("/api/v1/auth/register", { body: { email, password } }));
  }

  async login(email: string, password: string): Promise<void> {
    const tokens = unwrap(await this.raw.POST("/api/v1/auth/login", { body: { email, password } }));
    await this.options.tokens.set(tokens);
  }

  async logout(): Promise<void> {
    const tokens = await this.options.tokens.get();
    await this.options.tokens.set(null);
    if (tokens) {
      await this.raw.POST("/api/v1/auth/logout", { body: { refresh_token: tokens.refresh_token } });
    }
  }

  async me(): Promise<User> {
    return unwrap(await this.raw.GET("/api/v1/users/me"));
  }

  /** The profile, or null before onboarding. */
  async getProfile(): Promise<Profile | null> {
    const result = await this.raw.GET("/api/v1/profile");
    if (result.response.status === 404) return null;
    return unwrap(result);
  }

  async saveProfile(profile: ProfileIn): Promise<Profile> {
    return unwrap(await this.raw.PUT("/api/v1/profile", { body: profile }));
  }

  async listGoals(status?: Goal["status"]): Promise<Goal[]> {
    return unwrap(
      await this.raw.GET("/api/v1/goals", { params: { query: status ? { status } : {} } }),
    );
  }

  async createGoal(goal: GoalIn): Promise<Goal> {
    return unwrap(await this.raw.POST("/api/v1/goals", { body: goal }));
  }

  /** Today's check-in in the athlete's time zone, or null when it has not been entered yet. */
  async getTodayCheckin(): Promise<Checkin | null> {
    const result = await this.raw.GET("/api/v1/checkins/today");
    if (result.response.status === 404) return null;
    return unwrap(result);
  }

  /** Create or replace today's check-in; the server picks the day in the athlete's time zone. */
  async saveTodayCheckin(checkin: CheckinIn): Promise<Checkin> {
    return unwrap(await this.raw.PUT("/api/v1/checkins/today", { body: checkin }));
  }

  /** Create or replace the check-in of a given day (ISO date, today or up to 7 days late). */
  async saveCheckin(day: string, checkin: CheckinIn): Promise<Checkin> {
    return unwrap(
      await this.raw.PUT("/api/v1/checkins/{day}", { params: { path: { day } }, body: checkin }),
    );
  }

  /** Check-ins between two ISO dates (default: the last 14 days), newest first. */
  async listCheckins(range: { from?: string; to?: string } = {}): Promise<Checkin[]> {
    return unwrap(await this.raw.GET("/api/v1/checkins", { params: { query: range } }));
  }

  /** Today's calories and macros; null before onboarding (no profile yet). */
  async getTodayTargets(): Promise<NutritionTargets | null> {
    const result = await this.raw.GET("/api/v1/nutrition/targets/today");
    if (result.response.status === 404) return null;
    return unwrap(result);
  }

  /** Sync workouts from a device or app (max 500); known (source, external_id) pairs are updated. */
  async importWorkouts(workouts: ImportedWorkout[]): Promise<ImportResult> {
    return unwrap(await this.raw.POST("/api/v1/workouts/import", { body: { workouts } }));
  }

  /** Log a weight by hand; the newest weight also becomes the profile's weight. */
  async logWeight(weight: WeightIn): Promise<Weight> {
    return unwrap(await this.raw.POST("/api/v1/body/weights", { body: weight }));
  }

  /** Weights (newest first) and their 7-day trend between two ISO dates (default: 90 days). */
  async listWeights(range: { from?: string; to?: string } = {}): Promise<WeightHistory> {
    return unwrap(await this.raw.GET("/api/v1/body/weights", { params: { query: range } }));
  }

  async deleteWeight(id: string): Promise<void> {
    const result = await this.raw.DELETE("/api/v1/body/weights/{weight_id}", {
      params: { path: { weight_id: id } },
    });
    if (!result.response.ok) unwrap(result);
  }

  /** Sync smart-scale weights (max 500); implausible readings are skipped and counted. */
  async importWeights(weights: ImportedWeight[]): Promise<WeightImportResult> {
    return unwrap(await this.raw.POST("/api/v1/body/weights/import", { body: { weights } }));
  }

  async chat(message: string): Promise<ChatReply> {
    return unwrap(await this.raw.POST("/api/v1/coach/chat", { body: { message } }));
  }

  /** Adds the bearer token and, on a 401, refreshes once and retries the request. */
  private authMiddleware(): Middleware {
    return {
      onRequest: async ({ request, schemaPath }) => {
        if (AUTH_FREE.includes(schemaPath)) return request;
        const tokens = await this.options.tokens.get();
        if (tokens) request.headers.set("Authorization", `Bearer ${tokens.access_token}`);
        this.retryCopies.set(request, request.clone());
        return request;
      },
      onResponse: async ({ request, response, schemaPath }) => {
        if (response.status !== 401 || AUTH_FREE.includes(schemaPath)) return response;
        const copy = this.retryCopies.get(request);
        this.retryCopies.delete(request);
        const outcome = await this.refreshOnce();
        if (outcome === "expired") this.options.onSessionExpired?.();
        if (outcome !== "refreshed" || !copy) return response;
        const tokens = await this.options.tokens.get();
        copy.headers.set("Authorization", `Bearer ${tokens?.access_token ?? ""}`);
        // Sent directly, not through this middleware: a second 401 is returned, never looped.
        return (this.options.fetch ?? globalThis.fetch)(copy);
      },
    };
  }

  /** Parallel 401s share one refresh call. */
  private refreshOnce(): Promise<RefreshOutcome> {
    this.refreshing ??= this.refresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  /**
   * Only a rejected refresh token ends the session. Network errors, rate limits and server
   * errors keep the tokens, so a short outage never logs the user out.
   */
  private async refresh(): Promise<RefreshOutcome> {
    const tokens = await this.options.tokens.get();
    if (!tokens) return "expired";
    let result;
    try {
      result = await this.raw.POST("/api/v1/auth/refresh", {
        body: { refresh_token: tokens.refresh_token },
      });
    } catch {
      return "unavailable";
    }
    if (result.data) {
      await this.options.tokens.set(result.data);
      return "refreshed";
    }
    if (result.response.status === 400 || result.response.status === 401) {
      await this.options.tokens.set(null);
      return "expired";
    }
    return "unavailable";
  }
}

interface Result<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

function unwrap<T>(result: Result<T>): T {
  if (result.data !== undefined) return result.data;
  const problem = (result.error ?? {}) as { code?: string; detail?: string };
  throw new ApiError(
    result.response.status,
    problem.code ?? "unknown",
    problem.detail ?? `Request failed with ${result.response.status}`,
  );
}
