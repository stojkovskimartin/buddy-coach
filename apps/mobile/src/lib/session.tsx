/**
 * Session state for the mobile app: the API client, whether the user is logged in, and actions.
 * Screens get everything through `useSession()`; tests inject the client, the token store and
 * the startup check.
 */
import {
  BuddyClient,
  type ChatReply,
  type Checkin,
  type DailyTotals,
  type CheckinIn,
  type Goal,
  type GoalIn,
  type ImportedWeight,
  type ImportedWorkout,
  type ImportResult,
  type MealDay,
  type MealEntry,
  type MealEntryIn,
  type NutritionTargets,
  type Profile,
  type ProfileIn,
  type TokenStore,
  type TrainingLoad,
  type Weight,
  type WeightHistory,
  type WeightImportResult,
  type WeightIn,
} from "@buddy/api-client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { restoreSession, secureTokenStore } from "./tokenStore";

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
  saveTodayCheckin(checkin: CheckinIn): Promise<Checkin>;
  saveCheckin(day: string, checkin: CheckinIn): Promise<Checkin>;
  importWorkouts(workouts: ImportedWorkout[]): Promise<ImportResult>;
  importWeights(weights: ImportedWeight[]): Promise<WeightImportResult>;
  getMealDay(day?: string): Promise<MealDay>;
  logMeal(entry: MealEntryIn): Promise<MealEntry>;
  deleteMeal(id: string): Promise<void>;
  listDailyTotals(range?: { from?: string; to?: string }): Promise<DailyTotals[]>;
  getTrainingLoad(days?: number): Promise<TrainingLoad>;
  listCheckins(range?: { from?: string; to?: string }): Promise<Checkin[]>;
}

/** "loading" while the stored session is checked on start. */
export type SessionStatus = "loading" | "loggedIn" | "loggedOut";

export type CreateApi = (tokens: TokenStore, onSessionExpired: () => void) => CoachApi;

interface SessionValue {
  api: CoachApi;
  status: SessionStatus;
  /** True after the server ended the session (refresh token expired or revoked). */
  expired: boolean;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

const DEV_API_BASE_URL = "http://localhost:8000";

/**
 * The API base URL from EXPO_PUBLIC_API_BASE_URL. Development falls back to localhost; release
 * builds must use https, so tokens never travel in clear text.
 */
export function apiBaseUrl(
  configured: string | undefined = process.env.EXPO_PUBLIC_API_BASE_URL,
  dev: boolean = __DEV__,
): string {
  const url = configured?.trim() || (dev ? DEV_API_BASE_URL : "");
  if (!dev && !url.startsWith("https://")) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must be an https:// URL in release builds.");
  }
  return url;
}

export const createDefaultApi: CreateApi = (tokens, onSessionExpired) =>
  new BuddyClient({ baseUrl: apiBaseUrl(), tokens, onSessionExpired });

export function SessionProvider({
  children,
  createApi = createDefaultApi,
  tokens: tokenStore,
  restore = restoreSession,
}: {
  children: ReactNode;
  createApi?: CreateApi;
  tokens?: TokenStore;
  restore?: () => Promise<boolean>;
}) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [expired, setExpired] = useState(false);
  const tokens = useMemo(() => tokenStore ?? secureTokenStore(), [tokenStore]);
  const client = useMemo(
    () =>
      createApi(tokens, () => {
        setExpired(true);
        setStatus("loggedOut");
      }),
    [createApi, tokens],
  );

  useEffect(() => {
    let active = true;
    restore()
      .then((stored) => active && setStatus(stored ? "loggedIn" : "loggedOut"))
      .catch(() => active && setStatus("loggedOut"));
    return () => {
      active = false;
    };
  }, [restore]);

  const login = useCallback(
    async (email: string, password: string) => {
      await client.login(email, password);
      setExpired(false);
      setStatus("loggedIn");
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
      // The server could not revoke the token; still make sure nothing stays on the device.
      await tokens.set(null).catch(() => undefined);
    } finally {
      setExpired(false);
      setStatus("loggedOut");
    }
  }, [client, tokens]);

  const value = useMemo(
    () => ({ api: client, status, expired, login, register, logout }),
    [client, status, expired, login, register, logout],
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
