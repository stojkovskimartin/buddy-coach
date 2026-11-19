import {
  memoryTokenStore,
  type ChatReply,
  type Checkin,
  type CheckinIn,
  type Goal,
  type Profile,
  type TrainingLoad,
  type Weight,
  type WeightIn,
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

export function weight(weight_kg: number, overrides: Partial<Weight> = {}): Weight {
  return {
    id: `w-${weight_kg}`,
    source: "manual",
    measured_at: "2026-11-19T06:30:00Z",
    day: "2026-11-19",
    weight_kg,
    ...overrides,
  };
}

export function trainingLoad(days: TrainingLoad["days"]): TrainingLoad {
  const today = days[days.length - 1] ?? { day: "2026-11-19", load: 0, fitness: 0, fatigue: 0, form: 0 };
  return {
    days,
    today,
    acute_chronic_ratio: null,
    excluded_activities: [],
    ramp: { last_week_load: 0, this_week_load: 0, max_allowed_load: 0, verdict: "ok" },
  } satisfies TrainingLoad;
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
    getTodayTargets: jest.fn().mockResolvedValue(null),
    logWeight: jest.fn(async (w: WeightIn) => weight(w.weight_kg)),
    listWeights: jest.fn().mockResolvedValue({ weights: [], trend: [] }),
    deleteWeight: jest.fn().mockResolvedValue(undefined),
    saveTodayCheckin: jest.fn(async (c: CheckinIn) => checkin("2026-11-19", c)),
    saveCheckin: jest.fn(async (day: string, c: CheckinIn) => checkin(day, c)),
    importWorkouts: jest.fn().mockResolvedValue({ created: 0, updated: 0 }),
    importWeights: jest.fn().mockResolvedValue({ created: 0, updated: 0, skipped: 0 }),
    getMealDay: jest.fn().mockResolvedValue({
      day: "2026-11-19",
      entries: [],
      totals: { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    }),
    logMeal: jest.fn().mockResolvedValue({}),
    deleteMeal: jest.fn().mockResolvedValue(undefined),
    listDailyTotals: jest.fn().mockResolvedValue([]),
    getTrainingLoad: jest.fn().mockResolvedValue(trainingLoad([])),
    listCheckins: jest.fn().mockResolvedValue([]),
    uploadPhoto: jest.fn().mockResolvedValue({}),
    listPhotos: jest.fn().mockResolvedValue([]),
    photoImage: jest.fn().mockResolvedValue(new Blob(["jpeg"], { type: "image/jpeg" })),
    deletePhoto: jest.fn().mockResolvedValue(undefined),
    workoutSources: jest.fn().mockResolvedValue([]),
    weightSources: jest.fn().mockResolvedValue([]),
    integrations: jest.fn().mockResolvedValue([]),
    syncIntegration: jest.fn().mockResolvedValue({ synced: true, last_sync_at: null, created: 0, updated: 0, skipped: 0 }),
    disconnectIntegration: jest.fn().mockResolvedValue(undefined),
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
