/**
 * Session state for the web app: the API client, whether the user is logged in, and actions.
 * Components get everything through `useSession()`, so tests can inject a fake client.
 */
import {
  BuddyClient,
  type ChatReply,
  type Checkin,
  type CheckinIn,
  type Goal,
  type GoalIn,
  type MealDay,
  type MealEntry,
  type MealEntryIn,
  type NutritionTargets,
  type Profile,
  type ProfileIn,
  type TokenPair,
  type TokenStore,
  type Weight,
  type WeightHistory,
  type WeightIn,
} from "@buddy/api-client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/** The API calls the screens use (a subset of BuddyClient, easy to fake in tests). */
export interface CoachApi {
  register(email: string, password: string): Promise<unknown>;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  getProfile(): Promise<Profile | null>;
  saveProfile(profile: ProfileIn): Promise<Profile>;
  listGoals(status?: Goal["status"]): Promise<Goal[]>;
  createGoal(goal: GoalIn): Promise<Goal>;
  chat(message: string): Promise<ChatReply>;
  getTodayCheckin(): Promise<Checkin | null>;
  getTodayTargets(): Promise<NutritionTargets | null>;
  logWeight(weight: WeightIn): Promise<Weight>;
  listWeights(range?: { from?: string; to?: string }): Promise<WeightHistory>;
  deleteWeight(id: string): Promise<void>;
  logMeal(entry: MealEntryIn): Promise<MealEntry>;
  getMealDay(day?: string): Promise<MealDay>;
  deleteMeal(id: string): Promise<void>;
  saveTodayCheckin(checkin: CheckinIn): Promise<Checkin>;
  saveCheckin(day: string, checkin: CheckinIn): Promise<Checkin>;
}

const STORAGE_KEY = "buddy-coach.tokens";

/**
 * Tokens in localStorage: a trade-off for the web MVP, mitigated by a strict Content Security
 * Policy on production builds (see vite.config.ts). Mobile uses the OS keychain/keystore.
 * Moving web sessions to httpOnly cookies is tracked in docs/backlog.md.
 */
export function localTokenStore(storage: Storage = window.localStorage): TokenStore {
  return {
    get: async () => {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as TokenPair;
      } catch {
        storage.removeItem(STORAGE_KEY);
        return null;
      }
    },
    set: async (tokens) => {
      if (tokens) storage.setItem(STORAGE_KEY, JSON.stringify(tokens));
      else storage.removeItem(STORAGE_KEY);
    },
  };
}

export function hasStoredSession(storage: Storage = window.localStorage): boolean {
  return storage.getItem(STORAGE_KEY) !== null;
}

interface SessionValue {
  api: CoachApi;
  loggedIn: boolean;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function createDefaultApi(onSessionExpired: () => void): CoachApi {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
  return new BuddyClient({ baseUrl, tokens: localTokenStore(), onSessionExpired });
}

export function SessionProvider({
  children,
  api,
  initiallyLoggedIn,
}: {
  children: ReactNode;
  api?: CoachApi;
  initiallyLoggedIn?: boolean;
}) {
  const [loggedIn, setLoggedIn] = useState(initiallyLoggedIn ?? hasStoredSession());
  const client = useMemo(() => api ?? createDefaultApi(() => setLoggedIn(false)), [api]);

  const login = useCallback(
    async (email: string, password: string) => {
      await client.login(email, password);
      setLoggedIn(true);
    },
    [client],
  );
  const register = useCallback(
    async (email: string, password: string) => {
      await client.register(email, password);
      await login(email, password);
    },
    [client, login],
  );
  const logout = useCallback(async () => {
    try {
      await client.logout();
    } catch {
      // Tokens are already cleared locally; a failed server-side revoke must not keep the user in.
    } finally {
      setLoggedIn(false);
    }
  }, [client]);

  const value = useMemo(
    () => ({ api: client, loggedIn, login, register, logout }),
    [client, loggedIn, login, register, logout],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}

/** Human-readable message from any thrown value. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
