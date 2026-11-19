import type { MealDay, NutritionTargets } from "@buddy/api-client";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";

import App from "../App";
import { appProps, fakeApi } from "../test/fakeApi";

const TARGETS = {
  day: "2026-11-19",
  kcal: 2400,
  protein_g: 150,
  carbs_g: 280,
  fat_g: 75,
  goal: "maintain",
  reasons: [],
} as unknown as NutritionTargets;

const DAY: MealDay = {
  day: "2026-11-19",
  entries: [
    {
      id: "m1",
      meal: "breakfast",
      name: "Oat flakes",
      grams: 80,
      kcal: 300,
      protein_g: 10.4,
      carbs_g: 47.2,
      fat_g: 5.6,
      day: "2026-11-19",
      eaten_at: "2026-11-19T07:00:00Z",
      source: "open_food_facts",
      barcode: "7610000000017",
    },
  ],
  totals: { kcal: 300, protein_g: 10.4, carbs_g: 47.2, fat_g: 5.6 },
};

const OATS = {
  code: "4000417025005",
  product_name: "Oat flakes",
  brands: "Coop",
  nutriments: { "energy-kcal_100g": 375, proteins_100g: 13, carbohydrates_100g: 59, fat_100g: 7 },
};

function offAnswers(body: unknown, status = 200) {
  return jest.fn(async (_url: string) => ({ ok: status === 200, status, json: async () => body }));
}

async function openFood(api: ReturnType<typeof fakeApi>) {
  await render(<App {...appProps(api, true)} />);
  await fireEvent.press(await screen.findByRole("tab", { name: "Food" }));
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("FoodScreen", () => {
  it("shows the day against today's targets and deletes an entry after confirming", async () => {
    const api = fakeApi({
      getMealDay: jest.fn().mockResolvedValue(DAY),
      getTodayTargets: jest.fn().mockResolvedValue(TARGETS),
    });
    jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => buttons?.[1]?.onPress?.());
    await openFood(api);

    expect(await screen.findByLabelText("Calories: 300 of 2400 kcal")).toBeTruthy();
    expect(screen.getByText(/Oat flakes/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Delete Oat flakes" }));
    expect(api.deleteMeal).toHaveBeenCalledWith("m1");
  });

  it("loads only when the tab is first shown, and pages back a day", async () => {
    const api = fakeApi({ getTodayTargets: jest.fn().mockResolvedValue(TARGETS) });
    await render(<App {...appProps(api, true)} />);
    await screen.findByRole("tab", { name: "Food" });
    expect(api.getMealDay).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("tab", { name: "Food" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Previous day" }));
    expect(api.getMealDay).toHaveBeenLastCalledWith("2026-11-18");
  });

  it("finds a food by name and logs the portion", async () => {
    const fetchSpy = offAnswers({ products: [OATS] });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const api = fakeApi({ getTodayTargets: jest.fn().mockResolvedValue(TARGETS) });
    await openFood(api);

    await fireEvent.changeText(await screen.findByLabelText("Search food"), "oat");
    await fireEvent.press(screen.getByRole("button", { name: "Search" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Choose Oat flakes" }));
    await fireEvent.changeText(screen.getByLabelText("Grams eaten"), "80");
    await fireEvent.press(screen.getByRole("radio", { name: "Lunch" }));
    await fireEvent.press(screen.getByRole("button", { name: "Add to lunch" }));

    expect(fetchSpy.mock.calls[0]![0]).toContain("search_terms=oat");
    expect(api.logMeal).toHaveBeenCalledWith({
      meal: "lunch",
      name: "Oat flakes",
      grams: 80,
      kcal: 300,
      protein_g: 10.4,
      carbs_g: 47.2,
      fat_g: 5.6,
      source: "open_food_facts",
      barcode: "4000417025005",
    });
  });

  it("scans a barcode with the camera", async () => {
    const fetchSpy = offAnswers({ status: 1, product: OATS });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    await openFood(fakeApi({ getTodayTargets: jest.fn().mockResolvedValue(TARGETS) }));

    await fireEvent.press(await screen.findByRole("button", { name: "Scan a barcode" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Fake camera" }));

    expect(fetchSpy.mock.calls[0]![0]).toContain("/api/v2/product/4000417025005");
    expect(await screen.findByLabelText("Grams eaten")).toBeTruthy();
  });

  it("tries a UPC code without the leading zero an iPhone adds", async () => {
    const fetchSpy = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: 1, product: OATS }) });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    (globalThis as { fakeBarcode?: string }).fakeBarcode = "0012345678905";
    await openFood(fakeApi({ getTodayTargets: jest.fn().mockResolvedValue(TARGETS) }));

    await fireEvent.press(await screen.findByRole("button", { name: "Scan a barcode" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Fake camera" }));

    expect(await screen.findByLabelText("Grams eaten")).toBeTruthy();
    expect(fetchSpy.mock.calls[1]![0]).toContain("/api/v2/product/012345678905");
    delete (globalThis as { fakeBarcode?: string }).fakeBarcode;
  });

  it("logs a food typed in by hand and refuses one without calories", async () => {
    const api = fakeApi({ getTodayTargets: jest.fn().mockResolvedValue(TARGETS) });
    await openFood(api);
    await fireEvent.press(await screen.findByRole("button", { name: "Type in a food instead" }));
    await fireEvent.changeText(screen.getByLabelText("Food"), "Homemade soup");
    await fireEvent.changeText(screen.getByLabelText("Grams eaten"), "350");
    await fireEvent.press(screen.getByRole("button", { name: /Add to/ }));
    expect(await screen.findByText(/Enter a name, the grams/)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText("Calories (kcal)"), "210,5");
    await fireEvent.press(screen.getByRole("button", { name: /Add to/ }));
    expect(api.logMeal).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Homemade soup", grams: 350, kcal: 210.5, protein_g: 0 }),
    );
  });
});
