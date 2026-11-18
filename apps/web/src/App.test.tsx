import type { ChatReply, Checkin, CheckinIn, Goal, Profile, ProfileIn } from "@buddy/api-client";
import { ApiError } from "@buddy/api-client";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { isoDate } from "./lib/rules";
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

function checkinFor(day: string, c: CheckinIn, readiness?: Checkin["readiness"]): Checkin {
  return {
    day,
    sleep_quality: c.sleep_quality,
    soreness: c.soreness,
    mood: c.mood,
    sleep_hours: c.sleep_hours ?? null,
    hrv_ms: null,
    resting_hr: null,
    pain: c.pain ?? false,
    readiness: readiness ?? { score: 81, level: "green", limiting_factors: [] },
  };
}

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
    getTodayCheckin: vi.fn(async () => null),
    saveCheckin: vi.fn(async (day: string, c: CheckinIn) => checkinFor(day, c)),
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
    expect(screen.getByText(/· main goal/)).toBeInTheDocument();
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
    // Body data starts empty: nothing is submitted unless the user enters it.
    expect(screen.getByLabelText("Weight (kg)")).toHaveValue(null);
    await userEvent.type(screen.getByLabelText("Birth year"), "1998");
    await userEvent.selectOptions(screen.getByLabelText("Sex"), "male");
    await userEvent.type(screen.getByLabelText("Height (cm)"), "182");
    await userEvent.type(screen.getByLabelText("Weight (kg)"), "79");
    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));

    await waitFor(() => expect(api.saveProfile).toHaveBeenCalled());
    expect(vi.mocked(api.saveProfile).mock.calls[0]?.[0]).toMatchObject({
      birth_year: 1998,
      sex: "male",
      height_cm: 182,
      weight_kg: 79,
    });
  });

  it("shows an error instead of an empty profile form when loading fails", async () => {
    const api = fakeApi({
      getProfile: vi.fn(async () => {
        throw new ApiError(500, "internal_error", "Something went wrong on our side.");
      }),
    });
    renderAt("/onboarding", api, true);
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.queryByRole("form", { name: "Profile" })).not.toBeInTheDocument();
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
    // A main goal already exists, so a new goal is secondary unless the user says otherwise.
    expect(vi.mocked(api.createGoal).mock.calls[0]?.[0]).toEqual({
      goal_type: "lose_weight",
      title: "Race weight",
      target_weight_kg: 75,
      priority: "secondary",
    });
  });

  it("first goal becomes the main goal", async () => {
    const api = fakeApi({ listGoals: vi.fn(async () => []) });
    renderAt("/", api, true);
    await screen.findByText(/No active goal yet/);

    await userEvent.type(screen.getByLabelText("Title"), "Get fitter");
    await userEvent.click(screen.getByRole("button", { name: "Add goal" }));

    await waitFor(() => expect(api.createGoal).toHaveBeenCalled());
    expect(vi.mocked(api.createGoal).mock.calls[0]?.[0]).toMatchObject({ priority: "primary" });
  });

  it("endurance goals require a date and send the distance", async () => {
    const api = fakeApi();
    renderAt("/", api, true);
    await screen.findByText("Half Ironman");

    await userEvent.selectOptions(screen.getByLabelText("Type"), "endurance_event");
    expect(screen.getByLabelText("Target date")).toBeRequired();
    await userEvent.type(screen.getByLabelText("Title"), "Zurich Marathon");
    await userEvent.type(screen.getByLabelText("Distance (km)"), "42.2");
    const date = screen.getByLabelText("Target date");
    await userEvent.type(date, "2027-04-18");
    await userEvent.click(screen.getByRole("button", { name: "Add goal" }));

    await waitFor(() => expect(api.createGoal).toHaveBeenCalled());
    expect(vi.mocked(api.createGoal).mock.calls[0]?.[0]).toMatchObject({
      goal_type: "endurance_event",
      sport: "running",
      event_distance_km: 42.2,
      target_date: "2027-04-18",
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
    const container = bubble.closest(".bubble");
    expect(container).toHaveClass("escalated");
    expect(container).toHaveAttribute("role", "alert");
    expect(screen.getByText("Important")).toBeInTheDocument();
  });

  it("marks failed coach calls clearly", async () => {
    const api = fakeApi({
      chat: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    });
    renderAt("/coach", api, true);
    await userEvent.type(await screen.findByLabelText("Your message"), "hi");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Could not reach your coach")).toBeInTheDocument();
  });

  it("logs out even if the server cannot be reached", async () => {
    const api = fakeApi({
      logout: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    });
    renderAt("/", api, true);
    await screen.findByText("Half Ironman");
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(await screen.findByRole("form", { name: "Log in" })).toBeInTheDocument();
  });

  describe("morning check-in", () => {
    it("takes three answers and shows today's readiness", async () => {
      const api = fakeApi();
      renderAt("/", api, true);
      const form = await screen.findByRole("form", { name: "Morning check-in" });
      const save = within(form).getByRole("button", { name: "Save check-in" });
      expect(save).toBeDisabled();

      const sleep = within(form).getByRole("group", { name: "How did you sleep?" });
      await userEvent.click(within(sleep).getByRole("radio", { name: "4 of 5" }));
      const sore = within(form).getByRole("group", { name: "How do your muscles feel?" });
      await userEvent.click(within(sore).getByRole("radio", { name: "2 of 5" }));
      const mood = within(form).getByRole("group", { name: "How do you feel?" });
      await userEvent.click(within(mood).getByRole("radio", { name: "5 of 5 (Great)" }));
      await userEvent.type(within(form).getByLabelText("Hours of sleep (optional)"), "7.5");
      await userEvent.click(save);

      expect(api.saveCheckin).toHaveBeenCalledWith(isoDate(new Date()), {
        sleep_quality: 4,
        soreness: 2,
        mood: 5,
        pain: false,
        sleep_hours: 7.5,
      });
      expect(await screen.findByRole("status")).toHaveTextContent("Readiness 81/100");
    });

    it("shows what holds readiness back and allows changing the answers", async () => {
      const today = checkinFor(
        isoDate(new Date()),
        { sleep_quality: 1, soreness: 2, mood: 3, pain: true },
        { score: 20, level: "red", limiting_factors: ["sleep", "pain"] },
      );
      renderAt("/", fakeApi({ getTodayCheckin: vi.fn(async () => today) }), true);

      expect(await screen.findByRole("status")).toHaveTextContent("Rest or recovery only today.");
      expect(screen.getByText("Held back by: sleep, pain.")).toBeInTheDocument();
      expect(screen.getByText(/You reported pain/)).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Change today's answers" }));
      const sleep = screen.getByRole("group", { name: "How did you sleep?" });
      expect(within(sleep).getByRole("radio", { name: "1 of 5 (Very badly)" })).toBeChecked();
    });

    it("shows the error when saving fails", async () => {
      const api = fakeApi({ saveCheckin: vi.fn(async () => Promise.reject(new Error("Server down"))) });
      renderAt("/", api, true);
      const form = await screen.findByRole("form", { name: "Morning check-in" });
      for (const group of within(form).getAllByRole("group")) {
        await userEvent.click(within(group).getByRole("radio", { name: /^3 of 5/ }));
      }
      await userEvent.click(within(form).getByRole("button", { name: "Save check-in" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Server down");
    });
  });
});
