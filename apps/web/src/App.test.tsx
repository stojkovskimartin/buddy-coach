import type { ChatReply, Goal, Profile, ProfileIn } from "@buddy/api-client";
import { ApiError } from "@buddy/api-client";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";
import type { CoachApi } from "./lib/session";

const PROFILE: Profile = {
  user_id: "00000000-0000-0000-0000-000000000001",
  birth_year: 1998,
  sex: "male",
  height_cm: 182,
  weight_kg: 79,
  experience: "intermediate",
  coach_style: "friendly",
  available_days_per_week: 5,
  minutes_per_session: 60,
  timezone: "Europe/Zurich",
  locale: "en",
  updated_at: "2026-11-18T10:00:00Z",
};

const GOAL: Goal = {
  id: "00000000-0000-0000-0000-000000000002",
  goal_type: "endurance_event",
  title: "Half Ironman",
  sport: "triathlon",
  target_weight_kg: null,
  event_distance_km: 113,
  target_date: "2027-06-20",
  priority: "primary",
  status: "active",
  created_at: "2026-11-18T10:00:00Z",
};

function fakeApi(overrides: Partial<CoachApi> = {}): CoachApi {
  return {
    register: vi.fn(async () => ({})),
    login: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    getProfile: vi.fn(async () => PROFILE),
    saveProfile: vi.fn(async (p: ProfileIn) => ({ ...PROFILE, ...p })),
    listGoals: vi.fn(async () => [GOAL]),
    createGoal: vi.fn(async () => GOAL),
    chat: vi.fn(
      async (): Promise<ChatReply> => ({
        reply: "Aim for 2450 kcal today.",
        agent: "nutrition",
        tools_used: ["calculate_nutrition_targets"],
        escalated: false,
        safety_category: "none",
        degraded: false,
      }),
    ),
    ...overrides,
  };
}

function renderAt(path: string, api: CoachApi, loggedIn: boolean) {
  window.history.pushState({}, "", path);
  return render(<App api={api} initiallyLoggedIn={loggedIn} />);
}

describe("web app", () => {
  it("sends logged-out users to the login page", async () => {
    renderAt("/coach", fakeApi(), false);
    expect(await screen.findByRole("form", { name: "Log in" })).toBeInTheDocument();
  });

  it("logs in and shows the goals", async () => {
    const api = fakeApi();
    renderAt("/login", api, false);
    await userEvent.type(screen.getByLabelText("Email"), "martin@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "long-password-1");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(api.login).toHaveBeenCalledWith("martin@example.com", "long-password-1");
    expect(await screen.findByText("Half Ironman")).toBeInTheDocument();
    expect(screen.getByText(/main goal/)).toBeInTheDocument();
  });

  it("shows the server's error on failed login", async () => {
    const api = fakeApi({
      login: vi.fn(async () => {
        throw new ApiError(401, "unauthenticated", "Email or password is incorrect.");
      }),
    });
    renderAt("/login", api, false);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.ch");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect.");
  });

  it("registers, then logs in", async () => {
    const api = fakeApi();
    renderAt("/login", api, false);
    await userEvent.click(screen.getByRole("button", { name: /Create an account/ }));
    await userEvent.type(screen.getByLabelText("Email"), "new@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "long-password-1");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(api.login).toHaveBeenCalled());
    expect(api.register).toHaveBeenCalledWith("new@example.com", "long-password-1");
  });

  it("sends users without a profile to onboarding and saves it", async () => {
    const api = fakeApi({ getProfile: vi.fn(async () => null) });
    renderAt("/", api, true);

    const form = await screen.findByRole("form", { name: "Profile" });
    expect(form).toBeInTheDocument();
    const weight = screen.getByLabelText("Weight (kg)");
    await userEvent.clear(weight);
    await userEvent.type(weight, "79");
    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));

    await waitFor(() => expect(api.saveProfile).toHaveBeenCalled());
    expect(vi.mocked(api.saveProfile).mock.calls[0]?.[0]).toMatchObject({ weight_kg: 79 });
  });

  it("creates a weight goal with a target weight", async () => {
    const api = fakeApi();
    renderAt("/", api, true);
    await screen.findByText("Half Ironman");

    await userEvent.selectOptions(screen.getByLabelText("Type"), "lose_weight");
    await userEvent.type(screen.getByLabelText("Title"), "Race weight");
    await userEvent.type(screen.getByLabelText("Target weight (kg)"), "75");
    await userEvent.click(screen.getByRole("button", { name: "Add goal" }));

    await waitFor(() => expect(api.createGoal).toHaveBeenCalled());
    expect(vi.mocked(api.createGoal).mock.calls[0]?.[0]).toEqual({
      goal_type: "lose_weight",
      title: "Race weight",
      target_weight_kg: 75,
    });
  });

  it("chats with the coach and labels the specialist", async () => {
    const api = fakeApi();
    renderAt("/coach", api, true);

    await userEvent.type(await screen.findByLabelText("Your message"), "How much should I eat?");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Aim for 2450 kcal today.")).toBeInTheDocument();
    expect(screen.getByText("Nutrition")).toBeInTheDocument();
    expect(api.chat).toHaveBeenCalledWith("How much should I eat?");
  });

  it("highlights safety escalations", async () => {
    const api = fakeApi({
      chat: vi.fn(async () => ({
        reply: "This could be serious. Please stop exercising now.",
        agent: "head_coach" as const,
        tools_used: [],
        escalated: true,
        safety_category: "emergency" as const,
        degraded: false,
      })),
    });
    renderAt("/coach", api, true);
    await userEvent.click(await screen.findByRole("button", { name: /Should I take creatine/ }));

    const bubble = await screen.findByText(/This could be serious/);
    expect(bubble.closest(".bubble")).toHaveClass("escalated");
  });
});
