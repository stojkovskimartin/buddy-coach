import { ApiError } from "@buddy/api-client";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";
import type { CoachApi } from "../lib/session";
import { errorText } from ".";
import { MESSAGES } from "./messages";

const PROFILE = {
  birth_year: 1990,
  sex: "male" as const,
  height_cm: 180,
  weight_kg: 78,
  experience: "intermediate" as const,
  coach_style: "friendly" as const,
  available_days_per_week: 5,
  minutes_per_session: 60,
  timezone: "Europe/Zurich",
  locale: "mk-MK",
};

/** Only what the pages under test call; everything else fails loudly. */
function api(overrides: Partial<CoachApi> = {}): CoachApi {
  const base: Partial<CoachApi> = {
    login: vi.fn(async () => {
      throw new ApiError(401, "unauthenticated", "Email or password is incorrect.");
    }),
    logout: vi.fn(async () => undefined),
    getProfile: vi.fn(async () => PROFILE as never),
    listGoals: vi.fn(async () => []),
    getTodayCheckin: vi.fn(async () => null),
    getTodayTargets: vi.fn(async () => null),
    listWeights: vi.fn(async () => ({ weights: [], trend: [] })),
    listCheckins: vi.fn(async () => []),
    getMealDay: vi.fn(async () => ({
      day: "2026-11-20",
      entries: [
        {
          id: "e1",
          meal: "breakfast" as const,
          name: "Овес",
          grams: 60,
          kcal: 228,
          protein_g: 8,
          carbs_g: 36,
          fat_g: 4,
          source: "manual" as const,
          barcode: null,
          day: "2026-11-20",
          eaten_at: "2026-11-20T07:00:00Z",
        },
      ],
      totals: { kcal: 228, protein_g: 8, carbs_g: 36, fat_g: 4 },
    })),
    listPhotos: vi.fn(async () => []),
  };
  return { ...base, ...overrides } as CoachApi;
}

function renderIn(path: string, client: CoachApi, loggedIn: boolean, locale?: "en" | "mk") {
  window.history.pushState({}, "", path);
  return render(<App api={client} initiallyLoggedIn={loggedIn} {...(locale ? { locale } : {})} />);
}

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = "en";
});

describe("Macedonian", () => {
  it("is chosen from the menu, remembered and marks the page as Macedonian", async () => {
    const first = renderIn("/", api(), true);
    const nav = await screen.findByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Dashboard" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Македонски" }));

    expect(await screen.findByRole("navigation", { name: "Главно мени" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Преглед" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("mk");
    expect(window.localStorage.getItem("buddy-locale")).toBe("mk");
    first.unmount();

    renderIn("/", api(), true); // a reload keeps the choice
    expect(await screen.findByRole("link", { name: "Преглед" })).toBeInTheDocument();
  });

  it("offers the language switch before logging in and shows server errors in Macedonian", async () => {
    renderIn("/login", api(), false, "mk");
    expect(screen.getByRole("heading", { name: "Добредојде повторно" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Јазик" })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Е-пошта"), "a@b.mk");
    await userEvent.type(screen.getByLabelText("Лозинка"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Најави се" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Е-поштата или лозинката не се точни");
    expect(alert).not.toHaveTextContent("incorrect");
  });

  it("asks the check-in questions and greets in Macedonian", async () => {
    renderIn("/", api(), true, "mk");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      /^(Добро утро|Добар ден|Добра вечер)$/,
    );
    const form = await screen.findByRole("form", { name: "Дневна проверка" });
    const sleep = within(form).getByRole("group", { name: "Како спиеше?" });
    expect(within(sleep).getByRole("radio", { name: "1 од 5 (Многу лошо)" })).toBeInTheDocument();
    expect(screen.getByText("Твоите цели")).toBeInTheDocument();
  });

  it("shows the food diary with Macedonian meals and units", async () => {
    renderIn("/food", api(), true, "mk");
    expect(await screen.findByRole("heading", { name: "Појадок" })).toBeInTheDocument();
    expect(screen.getByText(/60 г · 228 ккал/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Додади храна" })).toBeInTheDocument();
  });

  it("names the progress periods in Macedonian", async () => {
    renderIn(
      "/progress",
      api({
        listDailyTotals: vi.fn(async () => []),
        getTrainingLoad: vi.fn(async () => ({
          days: [],
          today: { fitness: 0, fatigue: 0, form: 0 },
          acute_chronic_ratio: null,
        })) as never,
      }),
      true,
      "mk",
    );
    const period = await screen.findByRole("group", { name: "Период" });
    expect(within(period).getByRole("button", { name: "4 недели" })).toBeInTheDocument();
    expect(within(period).getByRole("button", { name: "1 година" })).toBeInTheDocument();
  });
});

describe("Macedonian details", () => {
  it("has the settings page in Macedonian, with a wrong password explained", async () => {
    const client = api({
      deleteAccount: vi.fn(async () => {
        throw new ApiError(403, "invalid_password", "The password is incorrect.");
      }),
    });
    renderIn("/settings", client, true, "mk");
    expect(await screen.findByRole("heading", { level: 1, name: "Поставки" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Поставки" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Преземи ги моите податоци" })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Лозинка"), "погрешна");
    await userEvent.click(screen.getByRole("checkbox", { name: /трајно избришани/ }));
    await userEvent.click(screen.getByRole("button", { name: "Избриши ја мојата сметка" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Лозинката не е точна.");
  });

  it("says in Macedonian when a barcode is unknown", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ status: 0 }), { status: 200 }));
    try {
      renderIn("/food", api(), true, "mk");
      await userEvent.type(await screen.findByLabelText("Баркод"), "4001234567890");
      await userEvent.click(screen.getByRole("button", { name: "Најди" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Нема храна со овој баркод");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("writes weights with a decimal comma", async () => {
    const weight = { id: "w1", day: "2026-11-20", weight_kg: 77.4, source: "manual" };
    renderIn("/", api({ listWeights: vi.fn(async () => ({ weights: [weight], trend: [] })) as never }), true, "mk");
    expect(await screen.findByText("77,4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Избриши 77,4 кг од 2026-11-20" })).toBeInTheDocument();
  });
});

describe("error texts", () => {
  it("keep the server's English text in English", () => {
    expect(errorText(new ApiError(409, "conflict", "An account with this email already exists."), "en")).toBe(
      "An account with this email already exists.",
    );
  });

  it("translate by code in Macedonian and never show English", () => {
    expect(errorText(new ApiError(409, "conflict", "An account exists."), "mk")).toBe(MESSAGES.mk.errors.conflict);
    expect(errorText(new ApiError(500, "something_new", "Boom."), "mk")).toBe(MESSAGES.mk.errors.unknown);
    expect(errorText(new TypeError("Failed to fetch"), "mk")).toBe(MESSAGES.mk.errors.network);
    expect(errorText("odd", "mk")).toBe(MESSAGES.mk.errors.unknown);
  });
});

describe("catalogs", () => {
  const leaves = (value: unknown, path = ""): [string, unknown][] =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k))
      : [[path, value]];

  it("have the same keys in both languages and no empty Macedonian text", () => {
    const en = leaves(MESSAGES.en);
    const mk = leaves(MESSAGES.mk);
    expect(mk.map(([k]) => k)).toEqual(en.map(([k]) => k));
    for (const [key, value] of mk) {
      if (typeof value === "string") expect(value.trim(), key).not.toBe("");
      if (Array.isArray(value)) for (const item of value) expect(String(item).trim(), key).not.toBe("");
    }
  });
});
