import { fireEvent, render, screen } from "@testing-library/react-native";

import App from "../App";
import { appProps, fakeApi, weight } from "../test/fakeApi";

const HISTORY = {
  weights: [
    weight(77.6, { id: "w2", source: "apple_health" }),
    weight(79.2, { id: "w1", day: "2026-08-21" }),
  ],
  trend: [
    { day: "2026-08-21", weight_kg: 79.2 },
    { day: "2026-11-19", weight_kg: 78.0 },
  ],
};

describe("WeightCard", () => {
  it("shows the latest weight, the trend and where readings came from", async () => {
    await render(<App {...appProps(fakeApi({ listWeights: jest.fn().mockResolvedValue(HISTORY) }), true)} />);
    expect(await screen.findByText("−1.2 kg since Aug 21")).toBeTruthy();
    expect(screen.getAllByText(/77\.6/)).toHaveLength(2); // the latest weight and its list entry
    expect(screen.getByLabelText(/from 79\.2 to 78\.0 kg/)).toBeTruthy();
    expect(screen.getByText(/2026-11-19 · Apple Health/)).toBeTruthy();
  });

  it("logs a weight typed with a comma, and deletes a wrong reading", async () => {
    const api = fakeApi({
      listWeights: jest.fn().mockResolvedValueOnce({ weights: [], trend: [] }).mockResolvedValue(HISTORY),
    });
    await render(<App {...appProps(api, true)} />);
    expect(await screen.findByText(/connect a smart scale/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Weight now (kg)"), "77,6");
    await fireEvent.press(screen.getByRole("button", { name: "Save weight" }));
    expect(api.logWeight).toHaveBeenCalledWith({ weight_kg: 77.6 });

    await fireEvent.press(await screen.findByRole("button", { name: "Delete 77.6 kg from 2026-11-19" }));
    expect(api.deleteWeight).toHaveBeenCalledWith("w2");
  });

  it("refuses an implausible weight without calling the server", async () => {
    const api = fakeApi();
    await render(<App {...appProps(api, true)} />);
    await fireEvent.changeText(await screen.findByLabelText("Weight now (kg)"), "7");
    await fireEvent.press(screen.getByRole("button", { name: "Save weight" }));
    expect(await screen.findByText(/between 30 and 300 kg/)).toBeTruthy();
    expect(api.logWeight).not.toHaveBeenCalled();
  });
});
