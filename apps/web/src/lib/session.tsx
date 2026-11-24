/**
 * Session state for the web app: the API client, whether the user is logged in, and actions.
 * Components get everything through `useSession()`, so tests can inject a fake client.
 */
import {
  BuddyClient,
  type ChatReply,
  type Checkin,
  type DailyTotals,
  type CheckinIn,
  type Goal,
  type GoalIn,
  type ImportResult,
  type IntegrationProvider,
  type MealDay,
  type MealEntry,
  type MealEntryIn,
  type NutritionTargets,
  type Photo,
  type PhotoKind,
  type Profile,
  type ProfileIn,
  type ProviderStatus,
  type SyncResult,
  type TokenPair,
  type TokenStore,
  type TrainingLoad,
  type Weight,
  type WeightSourceSummary,
  type WorkoutSourceSummary,
  type WeightHistory,
  type WeightIn,
} from "@buddy/api-client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { errorText } from "../i18n";

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
  listDailyTotals(range?: { from?: string; to?: string }): Promise<DailyTotals[]>;
  getTrainingLoad(days?: number): Promise<TrainingLoad>;
  listCheckins(range?: { from?: string; to?: string }): Promise<Checkin[]>;
  uploadPhoto(kind: PhotoKind, image: Blob): Promise<Photo>;
  listPhotos(query?: { kind?: PhotoKind; from?: string; to?: string }): Promise<Photo[]>;
  photoImage(id: string, size?: "full" | "thumb"): Promise<Blob>;
  deletePhoto(id: string): Promise<void>;
  uploadFit(file: Blob): Promise<ImportResult>;
  workoutSources(): Promise<WorkoutSourceSummary[]>;
  weightSources(): Promise<WeightSourceSummary[]>;
  integrations(): Promise<ProviderStatus[]>;
  connectIntegration(provider: IntegrationProvider): Promise<string>;
  finishIntegration(provider: IntegrationProvider, code: string, state: string): Promise<SyncResult>;
  syncIntegration(provider: IntegrationProvider): Promise<SyncResult>;
  disconnectIntegration(provider: IntegrationProvider): Promise<void>;
  saveTodayCheckin(checkin: CheckinIn): Promise<Checkin>;
  saveCheckin(day: string, checkin: CheckinIn): Promise<Checkin>;
  exportData(): Promise<Blob>;
  deleteAccount(password: string): Promise<void>;
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

/** Device choices (language, theme) that are not account data and stay after a deletion. */
const DEVICE_KEYS = new Set(["buddy-locale", "buddy-theme"]);

/** Remove the session and account data this app keeps on the device (its keys start with
 * "buddy"); the language and theme of the device stay. */
export function clearAppStorage(storage: Storage = window.localStorage): void {
  try {
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
    for (const key of keys) if (key?.startsWith("buddy") && !DEVICE_KEYS.has(key)) storage.removeItem(key);
  } catch {
    // Storage blocked: there is nothing stored to remove.
  }
}

/** Shown on the login page after the session ended for a reason the user should know. */
export type SessionNotice = "accountDeleted";

interface SessionValue {
  api: CoachApi;
  loggedIn: boolean;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  /** Delete the account; on success the session ends and the device is cleared. */
  deleteAccount(password: string): Promise<void>;
  notice: SessionNotice | null;
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
  const [notice, setNotice] = useState<SessionNotice | null>(null);
  const client = useMemo(() => api ?? createDefaultApi(() => setLoggedIn(false)), [api]);

  const login = useCallback(
    async (email: string, password: string) => {
      await client.login(email, password);
      setNotice(null);
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

  const deleteAccount = useCallback(
    async (password: string) => {
      await client.deleteAccount(password);
      clearAppStorage();
      setNotice("accountDeleted");
      setLoggedIn(false);
    },
    [client],
  );

  const value = useMemo(
    () => ({ api: client, loggedIn, login, register, logout, deleteAccount, notice }),
    [client, loggedIn, login, register, logout, deleteAccount, notice],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}

/** Human-readable message from any thrown value, in the language in use. */
export function errorMessage(error: unknown): string {
  return errorText(error);
}
