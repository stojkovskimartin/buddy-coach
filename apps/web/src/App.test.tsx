import type {
  ChatReply,
  DailyTotals,
  Checkin,
  CheckinIn,
  Goal,
  MealDay,
  MealEntry,
  MealEntryIn,
  NutritionTargets,
  Photo,
  PhotoKind,
  Profile,
  ProfileIn,
  ProviderStatus,
  TrainingLoad,
  Weight,
  WeightHistory,
  WeightIn,
  WeightSourceSummary,
  WorkoutSourceSummary,
} from "@buddy/api-client";
import { ApiError } from "@buddy/api-client";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { skipCheckinToday } from "./lib/greeting";
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
    listDailyTotals: vi.fn(async (): Promise<DailyTotals[]> => []),
    getTrainingLoad: vi.fn(async (): Promise<TrainingLoad> => LOAD),
    listCheckins: vi.fn(async (): Promise<Checkin[]> => []),
    uploadPhoto: vi.fn(async (kind: PhotoKind): Promise<Photo> => photoOf("new", kind)),
    listPhotos: vi.fn(async (): Promise<Photo[]> => []),
    photoImage: vi.fn(async () => new Blob(["jpeg"], { type: "image/jpeg" })),
    deletePhoto: vi.fn(async () => undefined),
    uploadFit: vi.fn(async () => ({ created: 1, updated: 0 })),
    workoutSources: vi.fn(async (): Promise<WorkoutSourceSummary[]> => []),
    weightSources: vi.fn(async (): Promise<WeightSourceSummary[]> => []),
    integrations: vi.fn(async (): Promise<ProviderStatus[]> => [
      { provider: "withings", available: true, connected: false, last_sync_at: null },
    ]),
    connectIntegration: vi.fn(async () => "https://account.withings.com/oauth2_user/authorize2?state=s"),
    finishIntegration: vi.fn(async () => ({ synced: true, last_sync_at: null, created: 2, updated: 0, skipped: 0 })),
    syncIntegration: vi.fn(async () => ({ synced: false, last_sync_at: null, created: 0, updated: 0, skipped: 0 })),
    disconnectIntegration: vi.fn(async () => undefined),
    saveTodayCheckin: vi.fn(async (c: CheckinIn) => checkinFor("2026-11-19", c)),
    saveCheckin: vi.fn(async (day: string, c: CheckinIn) => checkinFor(day, c)),
    exportData: vi.fn(async () => new Blob(["{}"], { type: "application/json" })),
    deleteAccount: vi.fn(async () => undefined),
    ...overrides,
  };
}

const LOAD: TrainingLoad = {
  today: { day: "2026-11-19", load: 0, fitness: 31.2, fatigue: 40.5, form: -9.3 },
  acute_chronic_ratio: 1.3,
  ramp: { last_week_load: 1500, this_week_load: 1700, max_allowed_load: 1800, verdict: "ok" },
  days: [
    { day: "2026-11-18", load: 300, fitness: 30.8, fatigue: 38.1, form: -7.3 },
    { day: "2026-11-19", load: 0, fitness: 31.2, fatigue: 40.5, form: -9.3 },
  ],
  excluded_activities: [],
};

function photoOf(id: string, kind: PhotoKind = "meal"): Photo {
  return { id, kind, day: "2026-11-19", width: 1280, height: 960, created_at: "2026-11-19T07:00:00Z" };
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
    await userEvent.click(screen.getByRole("button", { name: "New goal" }));

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
    await userEvent.click(screen.getByRole("button", { name: "New goal" }));

    await userEvent.type(screen.getByLabelText("Title"), "Get fitter");
    await userEvent.click(screen.getByRole("button", { name: "Add goal" }));

    await waitFor(() => expect(api.createGoal).toHaveBeenCalled());
    expect(vi.mocked(api.createGoal).mock.calls[0]?.[0]).toMatchObject({ priority: "primary" });
  });

  it("endurance goals require a date and send the distance", async () => {
    const api = fakeApi();
    renderAt("/", api, true);
    await screen.findByText("Half Ironman");
    await userEvent.click(screen.getByRole("button", { name: "New goal" }));

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

  describe("app shell", () => {
    afterEach(() => {
      window.localStorage.clear();
      document.documentElement.removeAttribute("data-theme");
    });

    it("marks the current section and offers a skip link to the content", async () => {
      renderAt("/food", fakeApi(), true);
      const nav = await screen.findByRole("navigation", { name: "Main" });
      expect(within(nav).getByRole("link", { name: "Food" })).toHaveAttribute("aria-current", "page");
      expect(within(nav).getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
      expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
      expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#content");
    });

    it("switches the theme and remembers it on this device", async () => {
      renderAt("/", fakeApi(), true);
      const themes = await screen.findByRole("group", { name: "Theme" });
      expect(within(themes).getByRole("radio", { name: "System" })).toBeChecked();

      await userEvent.click(within(themes).getByRole("radio", { name: "Dark" }));
      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
      expect(window.localStorage.getItem("buddy-theme")).toBe("dark");

      await userEvent.click(within(themes).getByRole("radio", { name: "System" }));
      expect(document.documentElement).not.toHaveAttribute("data-theme");
      expect(window.localStorage.getItem("buddy-theme")).toBeNull();
    });

    it("shows no navigation before logging in", () => {
      renderAt("/login", fakeApi(), false);
      expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
    });
  });

  describe("dashboard", () => {
    afterEach(() => window.localStorage.clear());

    it("greets by the time of day and shows the date", async () => {
      renderAt("/", fakeApi(), true);
      expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
        /^Good (morning|afternoon|evening)$/,
      );
    });

    it("shows the last week's check-ins, newest first, with words next to the colour", async () => {
      const api = fakeApi({
        listCheckins: vi.fn(async () => [
          checkinFor("2026-11-17", { sleep_quality: 2, soreness: 2, mood: 2 }, {
            score: 30,
            level: "red",
            limiting_factors: ["sleep"],
          }),
          checkinFor("2026-11-19", { sleep_quality: 4, soreness: 4, mood: 4 }),
        ]),
      });
      renderAt("/", api, true);
      const list = await screen.findByRole("list", { name: "Readiness of the last days" });
      const rows = within(list).getAllByRole("listitem");
      expect(rows.map((r) => r.textContent)).toEqual([
        expect.stringMatching(/^Thu 19 Nov.*81$/),
        expect.stringMatching(/^Tue 17 Nov.*30$/),
      ]);
      const range = vi.mocked(api.listCheckins).mock.calls[0]?.[0];
      expect(range?.from && range.to && Date.parse(range.to) - Date.parse(range.from)).toBe(
        6 * 86_400_000,
      );
    });

    it("says when there is no history yet", async () => {
      renderAt("/", fakeApi(), true);
      expect(await screen.findByText("No check-ins in the last 7 days yet.")).toBeInTheDocument();
    });

    it("opens the goal form on request and puts the cursor in the title", async () => {
      renderAt("/", fakeApi(), true);
      const toggle = await screen.findByRole("button", { name: "New goal" });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("form", { name: "New goal" })).not.toBeInTheDocument();
      await userEvent.click(toggle);
      expect(screen.getByRole("button", { name: "Close" })).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByLabelText("Title")).toHaveFocus();
    });
  });

  describe("optional check-in", () => {
    afterEach(() => window.localStorage.clear());

    it("folds away with 'Not now', stays folded today and opens again on request", async () => {
      const first = renderAt("/", fakeApi(), true);
      expect(await screen.findByText("Optional")).toBeInTheDocument();
      await userEvent.click(await screen.findByRole("button", { name: "Not now" }));

      expect(screen.queryByRole("form", { name: "Daily check-in" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Check in" })).toHaveFocus();
      first.unmount();

      renderAt("/", fakeApi(), true); // a reload the same day
      await userEvent.click(await screen.findByRole("button", { name: "Check in" }));
      expect(await screen.findByRole("form", { name: "Daily check-in" })).toBeInTheDocument();
    });

    it("asks about the day so far in the afternoon", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2026, 10, 20, 15, 0));
      try {
        renderAt("/", fakeApi(), true);
        expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Good afternoon");
        expect(screen.getByRole("heading", { name: "How is your day going?" })).toBeInTheDocument();
        expect(await screen.findByRole("form", { name: "Daily check-in" })).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it("shows today's readiness even after 'Not now' was chosen", async () => {
      skipCheckinToday(true);
      const today = checkinFor("2026-11-20", { sleep_quality: 4, soreness: 4, mood: 4 });
      renderAt("/", fakeApi({ getTodayCheckin: vi.fn(async () => today) }), true);
      expect(await screen.findByText(/Readiness 81\/100/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Check in" })).not.toBeInTheDocument();
    });

    it("offers no 'Not now' while changing answers already given", async () => {
      const today = checkinFor("2026-11-20", { sleep_quality: 4, soreness: 4, mood: 4 });
      renderAt("/", fakeApi({ getTodayCheckin: vi.fn(async () => today) }), true);
      await userEvent.click(await screen.findByRole("button", { name: "Change today's answers" }));
      expect(screen.getByRole("form", { name: "Daily check-in" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Not now" })).not.toBeInTheDocument();
      expect(screen.queryByText("Optional")).not.toBeInTheDocument();
    });

    it("updates the recent days after saving", async () => {
      const api = fakeApi();
      renderAt("/", api, true);
      const form = await screen.findByRole("form", { name: "Daily check-in" });
      for (const group of within(form).getAllByRole("group")) {
        await userEvent.click(within(group).getByRole("radio", { name: /^4 of 5/ }));
      }
      const calls = vi.mocked(api.listCheckins).mock.calls.length;
      await userEvent.click(within(form).getByRole("button", { name: "Save check-in" }));
      await waitFor(() => expect(vi.mocked(api.listCheckins).mock.calls.length).toBe(calls + 1));
    });
  });

  describe("login page", () => {
    it("switches to sign-up with a password hint and can show the password", async () => {
      renderAt("/login", fakeApi(), false);
      const account = screen.getByRole("group", { name: "Account" });
      expect(within(account).getByRole("button", { name: "I have an account" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await userEvent.click(within(account).getByRole("button", { name: "Create an account" }));
      expect(screen.getByRole("form", { name: "Create account" })).toBeInTheDocument();
      const password = screen.getByLabelText("Password");
      expect(password).toHaveAccessibleDescription("At least 10 characters.");
      expect(password).toHaveAttribute("type", "password");
      await userEvent.click(screen.getByRole("button", { name: "Show password" }));
      expect(password).toHaveAttribute("type", "text");
      expect(password).toHaveAttribute("autocomplete", "new-password");
    });
  });

  describe("morning check-in", () => {
    async function answerAll(value: string) {
      const form = await screen.findByRole("form", { name: "Daily check-in" });
      for (const group of within(form).getAllByRole("group")) {
        await userEvent.click(within(group).getByRole("radio", { name: new RegExp(`^${value} of 5`) }));
      }
      return form;
    }

    it("takes three answers, lets the server pick today and shows readiness", async () => {
      const api = fakeApi();
      renderAt("/", api, true);
      const form = await screen.findByRole("form", { name: "Daily check-in" });
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
      expect(screen.queryByRole("form", { name: "Daily check-in" })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByRole("form", { name: "Daily check-in" })).toBeInTheDocument();
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

  describe("progress", () => {
    it("shows weight, food, training and readiness over the chosen period", async () => {
      const api = fakeApi({
        listWeights: vi.fn(async () => ({
          weights: [weightOf(78, { day: "2026-11-19" }), weightOf(79.5, { id: "w0", day: "2026-11-01" })],
          trend: [
            { day: "2026-11-01", weight_kg: 79.5 },
            { day: "2026-11-19", weight_kg: 78.4 },
          ],
        })),
        listDailyTotals: vi.fn(async () => [
          { day: "2026-11-18", kcal: 2400, protein_g: 140, carbs_g: 280, fat_g: 70 },
          { day: "2026-11-19", kcal: 2601, protein_g: 150, carbs_g: 300, fat_g: 80 },
        ]),
        listCheckins: vi.fn(async () => [
          checkinFor("2026-11-19", { sleep_quality: 4, soreness: 4, mood: 4 }, { score: 80, level: "green", limiting_factors: [] }),
          checkinFor("2026-11-18", { sleep_quality: 2, soreness: 3, mood: 3 }, { score: 60, level: "amber", limiting_factors: ["sleep"] }),
        ]),
      });
      renderAt("/progress", api, true);
      expect(await screen.findByText(/−1.1 kg since Nov 1/)).toBeInTheDocument();
      expect(screen.getByRole("img", { name: /Weight over 28 days/ })).toBeInTheDocument();
      expect(screen.getByText(/2 days logged · on average 2501 kcal and 145 g protein/)).toBeInTheDocument();
      expect(screen.getByText(/Fitness 31.2 · fatigue 40.5 · form -9.3 · load ratio 1.3/)).toBeInTheDocument();
      expect(screen.getByText(/2 check-ins · on average 70 of 100/)).toBeInTheDocument();
      expect(api.getTrainingLoad).toHaveBeenLastCalledWith(28);

      await userEvent.click(screen.getByRole("button", { name: "1 year" }));
      await waitFor(() => expect(api.getTrainingLoad).toHaveBeenLastCalledWith(365));
      expect(await screen.findByRole("img", { name: /Weight over 365 days/ })).toBeInTheDocument();
      const checkinRange = vi.mocked(api.listCheckins).mock.lastCall?.[0];
      const weightRange = vi.mocked(api.listWeights).mock.lastCall?.[0];
      expect(checkinRange?.from && weightRange?.from && checkinRange.from > weightRange.from).toBe(true);
    });

    it("says what is missing in an empty period", async () => {
      renderAt("/progress", fakeApi(), true);
      expect(await screen.findByText("No weights in this period yet.")).toBeInTheDocument();
      expect(screen.getByText("No food logged in this period yet.")).toBeInTheDocument();
      expect(screen.getByText("No check-ins in this period yet.")).toBeInTheDocument();
      expect(screen.queryByText("No workouts in this period yet.")).not.toBeInTheDocument(); // LOAD has one
    });
  });

  describe("photos", () => {
    // jsdom has no object URLs; the mocks stay for later tests, which unmount these photos.
    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => "blob:photo");
      URL.revokeObjectURL = vi.fn();
    });

    const jpeg = () => new File(["jpeg"], "lunch.jpg", { type: "image/jpeg" });

    it("adds a meal photo for today and refuses other files", async () => {
      const api = fakeApi();
      renderAt("/food", api, true);
      const strip = await screen.findByRole("group", { name: "Meal photos" });
      const input = within(strip).getByLabelText("Add a photo");
      await userEvent.upload(input, jpeg());
      expect(api.uploadPhoto).toHaveBeenCalledWith("meal", expect.any(File));

      await userEvent.upload(input, new File(["gif"], "a.gif", { type: "image/gif" }), { applyAccept: false });
      expect(within(strip).getByRole("alert")).toHaveTextContent("JPEG, PNG or WebP");
      expect(api.uploadPhoto).toHaveBeenCalledTimes(1);
    });

    it("shows thumbnails, opens one and deletes it", async () => {
      const api = fakeApi({ listPhotos: vi.fn(async () => [photoOf("p1", "progress")]) });
      renderAt("/progress", api, true);
      const strip = await screen.findByRole("group", { name: "Progress photos" });
      await userEvent.click(await within(strip).findByRole("button", { name: "Open progress photos from 2026-11-19" }));
      expect(await within(strip).findAllByRole("img", { name: "Progress photos from 2026-11-19" })).toHaveLength(2);
      expect(api.photoImage).toHaveBeenCalledWith("p1", "full");
      await userEvent.click(within(strip).getByRole("button", { name: "Delete photo" }));
      expect(api.deletePhoto).toHaveBeenCalledWith("p1");
    });

    it("sets a profile picture on the profile page", async () => {
      const api = fakeApi();
      renderAt("/onboarding", api, true);
      const strip = await screen.findByRole("group", { name: "Profile picture" });
      await userEvent.upload(within(strip).getByLabelText("Choose a profile picture"), jpeg());
      expect(api.uploadPhoto).toHaveBeenCalledWith("avatar", expect.any(File));
      expect(api.listPhotos).toHaveBeenCalledWith({ kind: "avatar" });
    });
  });

  describe("connections", () => {
    it("shows where data comes from and imports a watch file", async () => {
      const api = fakeApi({
        workoutSources: vi.fn(async () => [
          { source: "health_connect" as const, workouts: 12, last_at: "2026-11-18T07:00:00Z" },
        ]),
        weightSources: vi.fn(async () => [
          { source: "health_connect" as const, weights: 30, last_at: "2026-11-19T06:00:00Z" },
        ]),
      });
      renderAt("/connections", api, true);
      expect(await screen.findByText(/12 workouts, latest .* · 30 weights, latest/)).toBeInTheDocument();

      const fit = screen.getByRole("region", { name: "Watch files (FIT)" });
      await userEvent.upload(within(fit).getByLabelText("Upload a .fit file"), new File(["fit"], "run.fit"));
      expect(api.uploadFit).toHaveBeenCalledWith(expect.any(File));
      expect(await within(fit).findByText("1 new workout.")).toBeInTheDocument();

      vi.mocked(api.uploadFit).mockRejectedValueOnce(new Error("The FIT file is damaged."));
      await userEvent.upload(within(fit).getByLabelText("Upload a .fit file"), new File(["x"], "bad.FIT"));
      expect(await screen.findByRole("alert")).toHaveTextContent("damaged");
    });

    it("sends the browser to the provider to connect", async () => {
      const assign = vi.fn();
      vi.stubGlobal("location", { ...window.location, assign });
      const api = fakeApi();
      renderAt("/connections", api, true);
      const accounts = await screen.findByRole("region", { name: "Accounts" });
      await userEvent.click(await within(accounts).findByRole("button", { name: "Connect Withings" }));
      expect(api.connectIntegration).toHaveBeenCalledWith("withings");
      expect(assign).toHaveBeenCalledWith("https://account.withings.com/oauth2_user/authorize2?state=s");
      expect(sessionStorage.getItem("buddy.connecting")).toBe("withings");
      vi.unstubAllGlobals();
    });

    it("syncs and disconnects a connected account", async () => {
      const api = fakeApi({
        integrations: vi.fn(async () => [
          { provider: "withings" as const, available: true, connected: true, last_sync_at: "2026-11-19T06:00:00Z" },
        ]),
      });
      renderAt("/connections", api, true);
      const accounts = await screen.findByRole("region", { name: "Accounts" });
      expect(await within(accounts).findByText(/Connected, last sync/)).toBeInTheDocument();
      await userEvent.click(within(accounts).getByRole("button", { name: "Sync Withings now" }));
      expect(await screen.findByText(/less than 10 minutes ago/)).toBeInTheDocument();
      await userEvent.click(within(accounts).getByRole("button", { name: "Disconnect Withings" }));
      expect(api.disconnectIntegration).toHaveBeenCalledWith("withings");
      expect(api.integrations).toHaveBeenCalledTimes(3); // reloaded after each action
    });

    it("counts workouts after a WHOOP sync", async () => {
      const api = fakeApi({
        integrations: vi.fn(async () => [
          { provider: "whoop" as const, available: true, connected: true, last_sync_at: null },
        ]),
        syncIntegration: vi.fn(async () => ({ synced: true, last_sync_at: null, created: 1, updated: 0, skipped: 0 })),
      });
      renderAt("/connections", api, true);
      const accounts = await screen.findByRole("region", { name: "Accounts" });
      await userEvent.click(await within(accounts).findByRole("button", { name: "Sync WHOOP now" }));
      expect(api.syncIntegration).toHaveBeenCalledWith("whoop");
      expect(await screen.findByText("1 new workout.")).toBeInTheDocument();
    });

    it("says when a provider is not set up on the server", async () => {
      const api = fakeApi({
        integrations: vi.fn(async () => [
          { provider: "withings" as const, available: false, connected: false, last_sync_at: null },
        ]),
      });
      renderAt("/connections", api, true);
      const accounts = await screen.findByRole("region", { name: "Accounts" });
      expect(await within(accounts).findByText("Not set up on this server yet")).toBeInTheDocument();
      expect(within(accounts).queryByRole("button")).toBeNull();
    });

    it("finishes connecting on the callback page and removes the code from the address", async () => {
      sessionStorage.setItem("buddy.connecting", "withings");
      const api = fakeApi();
      renderAt("/connections/callback?code=abc&state=xyz", api, true);
      expect(await screen.findByRole("status")).toHaveTextContent("Withings is connected: 2 new weights.");
      expect(api.finishIntegration).toHaveBeenCalledTimes(1);
      expect(api.finishIntegration).toHaveBeenCalledWith("withings", "abc", "xyz");
      expect(window.location.search).toBe("");
      expect(sessionStorage.getItem("buddy.connecting")).toBeNull();
    });

    it("says when the account is connected but the first sync failed", async () => {
      sessionStorage.setItem("buddy.connecting", "withings");
      const api = fakeApi({
        finishIntegration: vi.fn(async () => ({ synced: false, last_sync_at: null, created: 0, updated: 0, skipped: 0 })),
      });
      renderAt("/connections/callback?code=abc&state=xyz", api, true);
      expect(await screen.findByRole("status")).toHaveTextContent("Withings is connected. Bringing in the data failed");
    });

    it("explains a cancelled sign-in", async () => {
      const api = fakeApi();
      renderAt("/connections/callback?error=access_denied", api, true);
      expect(await screen.findByRole("alert")).toHaveTextContent("not connected");
      expect(api.finishIntegration).not.toHaveBeenCalled();
    });

    it("refuses other files", async () => {
      const api = fakeApi();
      renderAt("/connections", api, true);
      const fit = await screen.findByRole("region", { name: "Watch files (FIT)" });
      await userEvent.upload(within(fit).getByLabelText("Upload a .fit file"), new File(["x"], "run.gpx"), {
        applyAccept: false,
      });
      expect(await screen.findByRole("alert")).toHaveTextContent(".fit file");
      expect(api.uploadFit).not.toHaveBeenCalled();
    });
  });

  describe("settings", () => {
    afterEach(() => {
      window.localStorage.clear();
      document.documentElement.removeAttribute("data-theme");
      vi.restoreAllMocks();
    });

    async function openSettings(api: CoachApi) {
      renderAt("/", api, true);
      const nav = await screen.findByRole("navigation", { name: "Main" });
      await userEvent.click(within(nav).getByRole("link", { name: "Settings" }));
      return screen.findByRole("heading", { level: 1, name: "Settings" });
    }

    function settingsCard(name: string) {
      return within(screen.getByRole("region", { name }));
    }

    it("switches the language and saves it in the profile", async () => {
      const api = fakeApi();
      await openSettings(api);
      await userEvent.click(settingsCard("Language and theme").getByRole("radio", { name: "Македонски" }));

      expect(await screen.findByRole("heading", { level: 1, name: "Поставки" })).toBeInTheDocument();
      await waitFor(() => expect(api.saveProfile).toHaveBeenCalledTimes(1));
      const saved = vi.mocked(api.saveProfile).mock.calls[0]?.[0];
      expect(saved).toMatchObject({ locale: "mk", weight_kg: 79, timezone: "Europe/Zurich" });
      expect(saved).not.toHaveProperty("user_id");
      expect(saved).not.toHaveProperty("updated_at");
      // The menu's switcher follows.
      const nav = screen.getByRole("navigation", { name: "Главно мени" }).parentElement!;
      expect(within(nav).getByRole("radio", { name: "Македонски" })).toBeChecked();
    });

    it("works before onboarding and keeps the language on the device only", async () => {
      const api = fakeApi({ getProfile: vi.fn(async () => null) });
      renderAt("/settings", api, true);
      await screen.findByRole("heading", { level: 1, name: "Settings" });
      await userEvent.click(settingsCard("Language and theme").getByRole("radio", { name: "Македонски" }));

      expect(await screen.findByRole("heading", { level: 1, name: "Поставки" })).toBeInTheDocument();
      expect(window.localStorage.getItem("buddy-locale")).toBe("mk");
      expect(api.saveProfile).not.toHaveBeenCalled();
    });

    it("switches the theme here and in the menu", async () => {
      await openSettings(fakeApi());
      await userEvent.click(settingsCard("Language and theme").getByRole("radio", { name: "Dark" }));

      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
      const groups = screen.getAllByRole("group", { name: "Theme" });
      expect(groups).toHaveLength(2);
      for (const group of groups) expect(within(group).getByRole("radio", { name: "Dark" })).toBeChecked();
    });

    it("downloads the data as a JSON file", async () => {
      const api = fakeApi();
      const saved: string[] = [];
      Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:export") });
      Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        saved.push(this.download);
      });
      await openSettings(api);
      await userEvent.click(screen.getByRole("button", { name: "Download my data" }));

      await waitFor(() => expect(saved).toHaveLength(1));
      expect(api.exportData).toHaveBeenCalledTimes(1);
      expect(saved[0]).toMatch(/^buddy-coach-export-\d{4}-\d{2}-\d{2}\.json$/);
    });

    it("shows why the download failed", async () => {
      const api = fakeApi({
        exportData: vi.fn(async () => {
          throw new ApiError(500, "internal_error", "Something went wrong on our side.");
        }),
      });
      await openSettings(api);
      await userEvent.click(screen.getByRole("button", { name: "Download my data" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
    });

    it("deletes the account only with the password and the confirmation, then clears the device", async () => {
      window.localStorage.setItem("buddy-coach.tokens", "{}");
      window.localStorage.setItem("buddy-checkin-skipped", "2026-11-19");
      window.localStorage.setItem("other-app", "keep");
      const api = fakeApi();
      await openSettings(api);
      const card = settingsCard("Delete account");
      expect(card.getByText("all photos")).toBeInTheDocument();
      const button = card.getByRole("button", { name: "Delete my account" });
      expect(button).toBeDisabled();

      await userEvent.type(card.getByLabelText("Password"), "long-password-1");
      expect(button).toBeDisabled();
      await userEvent.click(card.getByRole("checkbox", { name: /deleted for good/ }));
      await userEvent.click(button);

      expect(await screen.findByRole("status")).toHaveTextContent("Your account and all its data have been deleted.");
      expect(screen.getByRole("form", { name: "Log in" })).toBeInTheDocument();
      expect(api.deleteAccount).toHaveBeenCalledWith("long-password-1");
      expect(window.localStorage.getItem("buddy-coach.tokens")).toBeNull();
      expect(window.localStorage.getItem("buddy-checkin-skipped")).toBeNull();
      expect(window.localStorage.getItem("other-app")).toBe("keep");
      expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
    });

    it("stays logged in when the password is wrong", async () => {
      window.localStorage.setItem("buddy-coach.tokens", "{}");
      const api = fakeApi({
        deleteAccount: vi.fn(async () => {
          throw new ApiError(403, "invalid_password", "The password is incorrect.");
        }),
      });
      await openSettings(api);
      const card = settingsCard("Delete account");
      await userEvent.type(card.getByLabelText("Password"), "wrong");
      await userEvent.click(card.getByRole("checkbox", { name: /deleted for good/ }));
      await userEvent.click(card.getByRole("button", { name: "Delete my account" }));

      expect(await card.findByRole("alert")).toHaveTextContent("The password is incorrect.");
      expect(card.getByRole("button", { name: "Delete my account" })).toBeEnabled();
      expect(window.localStorage.getItem("buddy-coach.tokens")).toBe("{}");
      expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    });
  });
});
