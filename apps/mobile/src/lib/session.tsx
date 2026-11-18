/**
 * Session state for the mobile app: the API client, whether the user is logged in, and actions.
 * Screens get everything through `useSession()`, so tests can inject a fake client.
 */
import {
  BuddyClient,
  type ChatReply,
  type Goal,
  type GoalIn,
  type Profile,
  type ProfileIn,
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

import { hasStoredSession, secureTokenStore } from "./tokenStore";

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
}

/** "loading" while the stored session is read on start. */
export type SessionStatus = "loading" | "loggedIn" | "loggedOut";

interface SessionValue {
  api: CoachApi;
  status: SessionStatus;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * The API base URL comes from EXPO_PUBLIC_API_BASE_URL. The Android emulator reaches the
 * host machine at 10.0.2.2; a real phone needs the computer's LAN address (see apps/mobile/README.md).
 */
export function apiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
}

export function createDefaultApi(onSessionExpired: () => void): CoachApi {
  return new BuddyClient({ baseUrl: apiBaseUrl(), tokens: secureTokenStore(), onSessionExpired });
}

export function SessionProvider({
  children,
  api,
  initialStatus,
}: {
  children: ReactNode;
  api?: CoachApi;
  initialStatus?: Exclude<SessionStatus, "loading">;
}) {
  const [status, setStatus] = useState<SessionStatus>(initialStatus ?? "loading");
  const client = useMemo(() => api ?? createDefaultApi(() => setStatus("loggedOut")), [api]);

  useEffect(() => {
    if (initialStatus) return;
    let active = true;
    hasStoredSession()
      .then((stored) => active && setStatus(stored ? "loggedIn" : "loggedOut"))
      .catch(() => active && setStatus("loggedOut"));
    return () => {
      active = false;
    };
  }, [initialStatus]);

  const login = useCallback(
    async (email: string, password: string) => {
      await client.login(email, password);
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
      // Tokens are already cleared locally; a failed server-side revoke must not keep the user in.
    } finally {
      setStatus("loggedOut");
    }
  }, [client]);

  const value = useMemo(
    () => ({ api: client, status, login, register, logout }),
    [client, status, login, register, logout],
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
