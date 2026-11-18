import type { ChatReply, Goal, Profile } from "@buddy/api-client";

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
    ...overrides,
  };
  return api satisfies Record<keyof CoachApi, jest.Mock>;
}
