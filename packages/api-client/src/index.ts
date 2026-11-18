/**
 * Typed client for the Buddy Coach API, shared by web, mobile and desktop.
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

/** Where the app keeps its tokens: localStorage on web, the OS keychain on mobile/desktop. */
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
export class BuddyClient {
  readonly raw: Client<paths>;
  private refreshing: Promise<boolean> | null = null;

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
        return request;
      },
      onResponse: async ({ request, response, schemaPath }) => {
        if (response.status !== 401 || AUTH_FREE.includes(schemaPath)) return response;
        if (!(await this.refreshOnce())) {
          this.options.onSessionExpired?.();
          return response;
        }
        const tokens = await this.options.tokens.get();
        const retry = new Request(request);
        retry.headers.set("Authorization", `Bearer ${tokens?.access_token ?? ""}`);
        return (this.options.fetch ?? globalThis.fetch)(retry);
      },
    };
  }

  /** Parallel 401s share one refresh call. */
  private refreshOnce(): Promise<boolean> {
    this.refreshing ??= this.refresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async refresh(): Promise<boolean> {
    const tokens = await this.options.tokens.get();
    if (!tokens) return false;
    const result = await this.raw.POST("/api/v1/auth/refresh", {
      body: { refresh_token: tokens.refresh_token },
    });
    if (!result.data) {
      await this.options.tokens.set(null);
      return false;
    }
    await this.options.tokens.set(result.data);
    return true;
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
