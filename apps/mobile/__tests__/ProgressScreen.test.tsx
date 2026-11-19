import { fireEvent, render, screen } from "@testing-library/react-native";

import App from "../App";
import { appProps, checkin, fakeApi, trainingLoad, weight } from "../test/fakeApi";

async function openProgress(api: ReturnType<typeof fakeApi>) {
  await render(<App {...appProps(api, true)} />);
  await fireEvent.press(await screen.findByRole("tab", { name: "Progress" }));
}

describe("ProgressScreen", () => {
  it("shows weight, food, training and readiness with charts described in words", async () => {
    const api = fakeApi({
      listWeights: jest.fn().mockResolvedValue({
        weights: [weight(78.0, { day: "2026-11-19" }), weight(79.2, { id: "w0", day: "2026-11-01" })],
        trend: [
          { day: "2026-11-01", weight_kg: 79.2 },
          { day: "2026-11-19", weight_kg: 78.0 },
        ],
      }),
      listDailyTotals: jest.fn().mockResolvedValue([
        { day: "2026-11-18", kcal: 2400, protein_g: 140, carbs_g: 280, fat_g: 70 },
      ]),
      getTrainingLoad: jest.fn().mockResolvedValue(
        trainingLoad([{ day: "2026-11-19", load: 300, fitness: 42, fatigue: 55, form: -13 }]),
      ),
      listCheckins: jest
        .fn()
        .mockResolvedValue([checkin("2026-11-19", { sleep_quality: 4, soreness: 2, mood: 4 })]),
    });
    await openProgress(api);

    expect(await screen.findByText("−1.2 kg since Nov 1")).toBeTruthy();
    expect(screen.getByLabelText("Weight over 28 days, 7-day trend and measurements")).toBeTruthy();
    expect(screen.getByText("1 day logged · on average 2400 kcal and 140 g protein")).toBeTruthy();
    expect(screen.getByText("Fitness 42 · fatigue 55 · form -13")).toBeTruthy();
    expect(screen.getByText("1 check-in · on average 81 of 100")).toBeTruthy();
  });

  it("loads only when shown, and loads a longer period on request", async () => {
    const api = fakeApi();
    await render(<App {...appProps(api, true)} />);
    await screen.findByRole("tab", { name: "Progress" });
    expect(api.getTrainingLoad).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("tab", { name: "Progress" }));
    expect(await screen.findByText("No weights in this period yet.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("radio", { name: "1 year" }));

    expect(api.getTrainingLoad).toHaveBeenLastCalledWith(365);
    expect(await screen.findByText("No workouts in this period yet.")).toBeTruthy();
  });

  it("reloads each time the tab is shown again", async () => {
    const api = fakeApi();
    await openProgress(api);
    await screen.findByText("No weights in this period yet.");
    await fireEvent.press(screen.getByRole("tab", { name: "Food" }));
    await fireEvent.press(screen.getByRole("tab", { name: "Progress" }));
    expect(api.getTrainingLoad).toHaveBeenCalledTimes(2);
  });

  it("never shows an older period's answer after a newer one", async () => {
    let answerFirst: (value: unknown) => void = () => undefined;
    const api = fakeApi({
      listDailyTotals: jest
        .fn()
        .mockReturnValueOnce(new Promise((resolve) => (answerFirst = resolve)))
        .mockResolvedValue([{ day: "2026-11-18", kcal: 2000, protein_g: 100, carbs_g: 200, fat_g: 60 }]),
    });
    await openProgress(api);
    await fireEvent.press(screen.getByRole("radio", { name: "1 year" }));
    expect(await screen.findByText(/on average 2000 kcal/)).toBeTruthy();

    answerFirst([{ day: "2026-11-18", kcal: 3000, protein_g: 100, carbs_g: 200, fat_g: 60 }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText(/on average 3000 kcal/)).toBeNull();
  });
});
