import {
  memoryTokenStore,
  type ChatReply,
  type Checkin,
  type CheckinIn,
  type Goal,
  type Profile,
} from "@buddy/api-client";

import type { CoachApi } from "../src/lib/session";

export function reply(overrides: Partial<ChatReply> = {}): ChatReply {
  return {
    agent: "nutrition",
    reply: "Eat 30 g protein after training.",
    escalated: false,
    degraded: false,
    safety_category: "none",
    tools_used: [],
    ...overrides,
  } as ChatReply;
}

export function checkin(
  day: string,
  c: CheckinIn,
  readiness: Checkin["readiness"] = { score: 81, level: "green", limiting_factors: [] },
): Checkin {
  return {
    day,
    sleep_quality: c.sleep_quality,
    soreness: c.soreness,
    mood: c.mood,
    sleep_hours: c.sleep_hours ?? null,
    hrv_ms: null,
    resting_hr: null,
    pain: c.pain ?? false,
    readiness,
  };
}

export function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "g1",
    title: "Zurich Marathon",
    goal_type: "endurance_event",
    priority: "primary",
    status: "active",
    sport: "running",
    target_date: null,
    target_weight_kg: null,
    event_distance_km: 42.2,
    created_at: "2026-11-01T10:00:00Z",
    ...overrides,
  } as Goal;
}

export function fakeApi(overrides: Partial<Record<keyof CoachApi, jest.Mock>> = {}) {
  const api = {
    register: jest.fn().mockResolvedValue({}),
    login: jest.fn().mockResolvedValue(undefined),
    logout: jest.fn().mockResolvedValue(undefined),
    getProfile: jest.fn().mockResolvedValue({} as Profile),
    saveProfile: jest.fn(),
    listGoals: jest.fn().mockResolvedValue([]),
    createGoal: jest.fn(),
    chat: jest.fn().mockResolvedValue(reply()),
    getTodayCheckin: jest.fn().mockResolvedValue(null),
    saveTodayCheckin: jest.fn(async (c: CheckinIn) => checkin("2026-11-19", c)),
    saveCheckin: jest.fn(async (day: string, c: CheckinIn) => checkin(day, c)),
    ...overrides,
  };
  return api satisfies Record<keyof CoachApi, jest.Mock>;
}

/** Renders the app with a fake API, already logged in or out (no secure storage involved). */
export function appProps(api: ReturnType<typeof fakeApi>, loggedIn: boolean) {
  return {
    createApi: () => api,
    tokens: memoryTokenStore(),
    restore: async () => loggedIn,
  };
}
