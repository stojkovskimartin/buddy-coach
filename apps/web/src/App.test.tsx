import type {
  ChatReply,
  Checkin,
  CheckinIn,
  Goal,
  MealDay,
  MealEntry,
  MealEntryIn,
  NutritionTargets,
  Profile,
  ProfileIn,
  Weight,
  WeightHistory,
  WeightIn,
} from "@buddy/api-client";
import { ApiError } from "@buddy/api-client";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

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
        tools_used: ["get_today_targets"],
        escalated: false,
        safety_category: "none",
        degraded: false,
      }),
    ),
    getTodayCheckin: vi.fn(async () => null),
    getTodayTargets: vi.fn(async () => null),
    logWeight: vi.fn(async (w: WeightIn) => weightOf(w.weight_kg)),
    listWeights: vi.fn(async (): Promise<WeightHistory> => ({ weights: [], trend: [] })),
    deleteWeight: vi.fn(async () => undefined),
    logMeal: vi.fn(async (e: MealEntryIn): Promise<MealEntry> => mealOf(e.name, { grams: e.grams, kcal: e.kcal })),
    getMealDay: vi.fn(async (): Promise<MealDay> => ({ day: "2026-11-19", entries: [], totals: ZERO })),
    deleteMeal: vi.fn(async () => undefined),
    saveTodayCheckin: vi.fn(async (c: CheckinIn) => checkinFor("2026-11-19", c)),
    saveCheckin: vi.fn(async (day: string, c: CheckinIn) => checkinFor(day, c)),
    ...overrides,
  };
}

const ZERO = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };

function mealOf(name: string, overrides: Partial<MealEntry> = {}): MealEntry {
  return {
    id: `m-${name}`,
    eaten_at: "2026-11-19T07:30:00Z",
    day: "2026-11-19",
    meal: "breakfast",
    name,
    grams: 80,
    kcal: 300,
    protein_g: 10.4,
    carbs_g: 47.2,
    fat_g: 5.6,
    source: "manual",
    barcode: null,
    ...overrides,
  };
}

function weightOf(weight_kg: number, overrides: Partial<Weight> = {}): Weight {
  return {
    id: `w-${weight_kg}`,
    source: "manual",
    measured_at: "2026-11-19T06:30:00Z",
    day: "2026-11-19",
    weight_kg,
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
    async function answerAll(value: string) {
      const form = await screen.findByRole("form", { name: "Morning check-in" });
      for (const group of within(form).getAllByRole("group")) {
        await userEvent.click(within(group).getByRole("radio", { name: new RegExp(`^${value} of 5`) }));
      }
      return form;
    }

    it("takes three answers, lets the server pick today and shows readiness", async () => {
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
      await userEvent.type(within(form).getByLabelText("Hours of sleep (optional)"), "7,5");
      await userEvent.click(save);

      expect(api.saveTodayCheckin).toHaveBeenCalledWith({
        sleep_quality: 4,
        soreness: 2,
        mood: 5,
        pain: false,
        sleep_hours: 7.5,
      });
      expect(api.saveCheckin).not.toHaveBeenCalled();
      expect(await screen.findByRole("status")).toHaveTextContent("Readiness 81/100");
      expect(screen.getByText(/not medical advice/)).toBeInTheDocument();
    });

    it("accepts a comma as decimal separator for sleep hours", async () => {
      const api = fakeApi();
      renderAt("/", api, true);
      const form = await answerAll("3");
      await userEvent.type(within(form).getByLabelText("Hours of sleep (optional)"), "6,5");
      await userEvent.click(within(form).getByRole("button", { name: "Save check-in" }));
      await waitFor(() =>
        expect(api.saveTodayCheckin).toHaveBeenCalledWith(expect.objectContaining({ sleep_hours: 6.5 })),
      );
    });

    it("refuses impossible sleep hours", async () => {
      renderAt("/", fakeApi(), true);
      const form = await answerAll("3");
      await userEvent.type(within(form).getByLabelText("Hours of sleep (optional)"), "20");
      expect(screen.getByText("Enter 0 to 16 hours.")).toBeInTheDocument();
      expect(within(form).getByRole("button", { name: "Save check-in" })).toBeDisabled();
    });

    it("shows what holds readiness back and saves changes to the same day", async () => {
      const loadedDay = "2026-11-17"; // e.g. the profile's day differs from the device's
      const today = checkinFor(
        loadedDay,
        { sleep_quality: 1, soreness: 2, mood: 3, pain: true },
        { score: 20, level: "red", limiting_factors: ["sleep", "pain"] },
      );
      const api = fakeApi({ getTodayCheckin: vi.fn(async () => today) });
      renderAt("/", api, true);

      expect(await screen.findByRole("status")).toHaveTextContent("Consider rest or light recovery");
      expect(screen.getByText("Held back by: sleep, pain.")).toBeInTheDocument();
      expect(screen.getByText(/get medical help now/)).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Change today's answers" }));
      const sleep = screen.getByRole("group", { name: "How did you sleep?" });
      expect(within(sleep).getByRole("radio", { name: "1 of 5 (Very badly)" })).toBeChecked();
      await userEvent.click(within(sleep).getByRole("radio", { name: "3 of 5" }));
      await userEvent.click(screen.getByRole("button", { name: "Save check-in" }));

      await waitFor(() =>
        expect(api.saveCheckin).toHaveBeenCalledWith(loadedDay, expect.objectContaining({ sleep_quality: 3 })),
      );
      expect(api.saveTodayCheckin).not.toHaveBeenCalled();
    });

    it("never shows an empty form when loading fails, and can try again", async () => {
      const getTodayCheckin = vi
        .fn<CoachApi["getTodayCheckin"]>()
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce(null);
      renderAt("/", fakeApi({ getTodayCheckin }), true);

      expect(await screen.findByRole("alert")).toHaveTextContent("Network error");
      expect(screen.queryByRole("form", { name: "Morning check-in" })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByRole("form", { name: "Morning check-in" })).toBeInTheDocument();
    });

    it("shows the error when saving fails and clears it on the next try", async () => {
      const saveTodayCheckin = vi
        .fn<CoachApi["saveTodayCheckin"]>()
        .mockRejectedValueOnce(new Error("Server down"))
        .mockImplementationOnce(async (c) => checkinFor("2026-11-19", c));
      renderAt("/", fakeApi({ saveTodayCheckin }), true);
      const form = await answerAll("3");
      await userEvent.click(within(form).getByRole("button", { name: "Save check-in" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Server down");

      await userEvent.click(within(form).getByRole("button", { name: "Save check-in" }));
      expect(await screen.findByRole("status")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("today's food targets", () => {
    const TARGETS: NutritionTargets = {
      day: "2026-11-19",
      goal: "lose",
      kcal: 2450,
      protein_g: 158,
      carbs_g: 290,
      fat_g: 70,
      maintenance_kcal: 2900,
      floor_applied: false,
      training_kcal_estimated: true,
      reasons: ["Training energy is estimated from your available training time."],
    };

    it("shows calories, macros and why", async () => {
      renderAt("/", fakeApi({ getTodayTargets: vi.fn(async () => TARGETS) }), true);
      const card = await screen.findByRole("region", { name: "Today's food targets" });
      expect(await within(card).findByText("2,450")).toBeInTheDocument();
      expect(within(card).getByText(/Losing weight/)).toBeInTheDocument();
      expect(within(card).getByText("158 g")).toBeInTheDocument();
      expect(within(card).getByText("290 g")).toBeInTheDocument();
      expect(within(card).getByText("70 g")).toBeInTheDocument();
      expect(within(card).getByText(TARGETS.reasons[0] as string)).toBeInTheDocument();
    });

    it("asks for the profile when there are no targets yet", async () => {
      renderAt("/", fakeApi(), true);
      const card = await screen.findByRole("region", { name: "Today's food targets" });
      expect(await within(card).findByText(/Complete your profile/)).toBeInTheDocument();
    });

    it("shows the error when loading fails, and can try again", async () => {
      const getTodayTargets = vi
        .fn<CoachApi["getTodayTargets"]>()
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce(TARGETS);
      renderAt("/", fakeApi({ getTodayTargets }), true);
      const card = await screen.findByRole("region", { name: "Today's food targets" });
      expect(await within(card).findByRole("alert")).toHaveTextContent("Network error");
      await userEvent.click(within(card).getByRole("button", { name: "Try again" }));
      expect(await within(card).findByText("2,450")).toBeInTheDocument();
    });
  });

  describe("weight", () => {
    const HISTORY: WeightHistory = {
      weights: [
        weightOf(77.6, { id: "w2", day: "2026-11-19", source: "health_connect" }),
        weightOf(79.2, { id: "w1", day: "2026-08-21" }),
      ],
      trend: [
        { day: "2026-08-21", weight_kg: 79.2 },
        { day: "2026-11-19", weight_kg: 78.0 },
      ],
    };

    it("shows the latest weight, the trend chart and where readings came from", async () => {
      renderAt("/", fakeApi({ listWeights: vi.fn(async () => HISTORY) }), true);
      const card = await screen.findByRole("region", { name: "Weight" });
      expect(await within(card).findByText("77.6")).toBeInTheDocument();
      expect(within(card).getByText(/−1.2 kg since Aug 21/)).toBeInTheDocument();
      expect(within(card).getByRole("img", { name: /from 79.2 to 78.0 kg/ })).toBeInTheDocument();
      expect(within(card).getByText(/Health Connect/)).toBeInTheDocument();
    });

    it("logs a weight with a comma and reloads", async () => {
      const listWeights = vi
        .fn<CoachApi["listWeights"]>()
        .mockResolvedValueOnce({ weights: [], trend: [] })
        .mockResolvedValue({ weights: [weightOf(77.5)], trend: [] });
      const api = fakeApi({ listWeights });
      renderAt("/", api, true);
      const card = await screen.findByRole("region", { name: "Weight" });
      expect(await within(card).findByText(/connect a smart scale/)).toBeInTheDocument();
      await userEvent.type(within(card).getByLabelText("Weight now (kg)"), "77,5");
      await userEvent.click(within(card).getByRole("button", { name: "Save weight" }));
      expect(api.logWeight).toHaveBeenCalledWith({ weight_kg: 77.5 });
      expect(await within(card).findByText("77.5")).toBeInTheDocument();
      expect(within(card).getByLabelText("Weight now (kg)")).toHaveValue("");
    });

    it("refuses an implausible weight without calling the server", async () => {
      const api = fakeApi();
      renderAt("/", api, true);
      const card = await screen.findByRole("region", { name: "Weight" });
      await userEvent.type(within(card).getByLabelText("Weight now (kg)"), "7");
      await userEvent.click(within(card).getByRole("button", { name: "Save weight" }));
      expect(within(card).getByRole("alert")).toHaveTextContent("between 30 and 300 kg");
      expect(api.logWeight).not.toHaveBeenCalled();
    });

    it("deletes a wrong reading", async () => {
      const api = fakeApi({ listWeights: vi.fn(async () => HISTORY) });
      renderAt("/", api, true);
      const card = await screen.findByRole("region", { name: "Weight" });
      await userEvent.click(
        await within(card).findByRole("button", { name: "Delete 77.6 kg from 2026-11-19" }),
      );
      expect(api.deleteWeight).toHaveBeenCalledWith("w2");
    });
  });

  describe("food diary", () => {
    const TARGETS: NutritionTargets = {
      day: "2026-11-19",
      goal: "maintain",
      kcal: 2500,
      protein_g: 150,
      carbs_g: 300,
      fat_g: 80,
      maintenance_kcal: 2500,
      floor_applied: false,
      training_kcal_estimated: true,
      reasons: [],
    };
    const OATS = {
      code: "7610000000017",
      product_name: "Oat flakes",
      brands: "Coop",
      nutriments: { "energy-kcal_100g": 375, proteins_100g: 13, carbohydrates_100g: 59, fat_100g: 7 },
    };

    afterEach(() => vi.unstubAllGlobals());

    it("shows the day against today's targets, grouped by meal, and deletes an entry", async () => {
      const day: MealDay = {
        day: "2026-11-19",
        entries: [mealOf("Oat flakes"), mealOf("Rice", { id: "m2", meal: "lunch", kcal: 195 })],
        totals: { kcal: 495, protein_g: 14.4, carbs_g: 89.2, fat_g: 6.1 },
      };
      const api = fakeApi({ getMealDay: vi.fn(async () => day), getTodayTargets: vi.fn(async () => TARGETS) });
      renderAt("/food", api, true);
      expect(await screen.findByText("495 / 2500 kcal")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Breakfast" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Lunch" })).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Delete Rice" }));
      expect(api.deleteMeal).toHaveBeenCalledWith("m2");
    });

    it("searches Open Food Facts and adds the portion eaten", async () => {
      const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ products: [OATS] }) }));
      vi.stubGlobal("fetch", fetchMock);
      const api = fakeApi({ getTodayTargets: vi.fn(async () => TARGETS) });
      renderAt("/food", api, true);
      await userEvent.selectOptions(await screen.findByLabelText("Meal"), "breakfast");
      await userEvent.type(screen.getByRole("textbox", { name: "Search food" }), "oats");
      await userEvent.click(screen.getByRole("button", { name: "Search" }));
      await userEvent.click(await screen.findByRole("button", { name: "Choose Oat flakes" }));
      await userEvent.clear(screen.getByLabelText("Grams eaten"));
      await userEvent.type(screen.getByLabelText("Grams eaten"), "80");
      expect(screen.getByText(/300 kcal · protein 10.4 g/)).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Add to breakfast" }));
      expect(api.logMeal).toHaveBeenCalledWith({
        meal: "breakfast",
        name: "Oat flakes",
        grams: 80,
        kcal: 300,
        protein_g: 10.4,
        carbs_g: 47.2,
        fat_g: 5.6,
        source: "open_food_facts",
        barcode: "7610000000017",
      });
      expect(screen.getByText(/Open Food Facts \(ODbL\)/)).toBeInTheDocument();
    });

    it("shows an earlier day read-only, without today's targets", async () => {
      const getMealDay = vi.fn(async (day?: string): Promise<MealDay> => ({
        day: day ?? "2026-11-19",
        entries: [],
        totals: { ...ZERO, kcal: day ? 1800 : 0 },
      }));
      const api = fakeApi({ getMealDay, getTodayTargets: vi.fn(async () => TARGETS) });
      renderAt("/food", api, true);
      expect(await screen.findByText("0 / 2500 kcal")).toBeInTheDocument();
      const picker = screen.getByLabelText("Day");
      expect(picker).toHaveAttribute("max", "2026-11-19");
      expect(screen.getByRole("heading", { name: "Add food" })).toBeInTheDocument();

      fireEvent.change(picker, { target: { value: "2026-11-18" } });
      expect(await screen.findByText("1800 kcal")).toBeInTheDocument();
      expect(getMealDay).toHaveBeenLastCalledWith("2026-11-18");
      expect(screen.queryByRole("heading", { name: "Add food" })).not.toBeInTheDocument();
    });

    it("says when a barcode is unknown", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 0 }) })));
      renderAt("/food", fakeApi(), true);
      await userEvent.type(await screen.findByLabelText("Barcode"), "7610000000017");
      await userEvent.click(screen.getByRole("button", { name: "Find" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(/No food with this barcode/);
    });

    it("adds a typed-in food and checks the input first", async () => {
      const api = fakeApi();
      renderAt("/food", api, true);
      await userEvent.click(await screen.findByRole("button", { name: "Type in a food instead" }));
      const form = screen.getByRole("form", { name: "Type in a food" });
      await userEvent.type(within(form).getByLabelText("Food"), "Homemade soup");
      await userEvent.click(within(form).getByRole("button", { name: /Add to/ }));
      expect(within(form).getByRole("alert")).toHaveTextContent(/grams/);
      await userEvent.type(within(form).getByLabelText("Grams eaten"), "350");
      await userEvent.type(within(form).getByLabelText("Calories (kcal)"), "210");
      await userEvent.click(within(form).getByRole("button", { name: /Add to/ }));
      expect(api.logMeal).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Homemade soup", grams: 350, kcal: 210, protein_g: 0 }),
      );
    });
  });
});
