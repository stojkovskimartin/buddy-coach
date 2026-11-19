import type { NutritionTargets } from "@buddy/api-client";
import { fireEvent, render, screen } from "@testing-library/react-native";

import App from "../App";
import { appProps, fakeApi } from "../test/fakeApi";

const TARGETS: NutritionTargets = {
  day: "2026-11-19",
  goal: "gain",
  kcal: 3120,
  protein_g: 158,
  carbs_g: 410,
  fat_g: 90,
  maintenance_kcal: 2900,
  floor_applied: false,
  training_kcal_estimated: true,
  reasons: ["Training energy is estimated from your available training time."],
};

describe("TargetsCard", () => {
  it("shows calories, macros and why", async () => {
    await render(<App {...appProps(fakeApi({ getTodayTargets: jest.fn().mockResolvedValue(TARGETS) }), true)} />);
    expect(await screen.findByText("Today's food targets")).toBeTruthy();
    expect(await screen.findByText(/3,120/)).toBeTruthy();
    expect(screen.getByText("Gaining weight")).toBeTruthy();
    expect(screen.getByLabelText("Protein 158 grams")).toBeTruthy();
    expect(screen.getByLabelText("Carbs 410 grams")).toBeTruthy();
    expect(screen.getByLabelText("Fat 90 grams")).toBeTruthy();
    expect(screen.getByText(TARGETS.reasons[0]!)).toBeTruthy();
  });

  it("is hidden until there is a profile", async () => {
    const api = fakeApi({ getProfile: jest.fn().mockResolvedValue(null) });
    await render(<App {...appProps(api, true)} />);
    expect(await screen.findByText("Set up your profile")).toBeTruthy();
    expect(screen.queryByText("Today's food targets")).toBeNull();
    expect(api.getTodayTargets).not.toHaveBeenCalled();
  });

  it("shows the error when loading fails, and can try again", async () => {
    const getTodayTargets = jest.fn().mockRejectedValueOnce(new Error("Network error")).mockResolvedValueOnce(TARGETS);
    await render(<App {...appProps(fakeApi({ getTodayTargets }), true)} />);
    expect(await screen.findByText("Network error")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/3,120/)).toBeTruthy();
  });
});
