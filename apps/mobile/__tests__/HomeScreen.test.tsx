import { fireEvent, render, screen } from "@testing-library/react-native";

import App from "../App";
import { daysUntil } from "../src/screens/HomeScreen";
import { appProps, fakeApi, goal } from "../test/fakeApi";

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("HomeScreen", () => {
  it("shows the main goal with a countdown and the other goals", async () => {
    const api = fakeApi({
      listGoals: jest.fn().mockResolvedValue([
        goal({ target_date: isoInDays(10) }),
        goal({ id: "g2", title: "Lose 3 kg", goal_type: "lose_weight", priority: "secondary" }),
      ]),
    });
    await render(<App {...appProps(api, true)} />);

    expect(await screen.findByText("Zurich Marathon")).toBeTruthy();
    expect(screen.getByText("Endurance event")).toBeTruthy();
    expect(screen.getByText("10 days to go")).toBeTruthy();
    expect(screen.getByText("Lose 3 kg")).toBeTruthy();
    expect(api.listGoals).toHaveBeenCalledWith("active");
  });

  it.each([
    [1, "Tomorrow"],
    [0, "Today is the day"],
    [-3, "Date passed"],
  ])("shows %i days as %s", async (days, text) => {
    const api = fakeApi({ listGoals: jest.fn().mockResolvedValue([goal({ target_date: isoInDays(days) })]) });
    await render(<App {...appProps(api, true)} />);
    await screen.findByText("Zurich Marathon");
    expect(screen.getByText(text, { exact: true })).toBeTruthy();
  });

  it("asks to set up the profile when there is none", async () => {
    const api = fakeApi({ getProfile: jest.fn().mockResolvedValue(null) });
    await render(<App {...appProps(api, true)} />);
    expect(await screen.findByText("Set up your profile")).toBeTruthy();
  });

  it("shows an error when loading fails", async () => {
    const api = fakeApi({ listGoals: jest.fn().mockRejectedValue(new Error("Server unavailable")) });
    await render(<App {...appProps(api, true)} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Server unavailable");
  });

  it("logs out and clears the tokens even when the server cannot be reached", async () => {
    const api = fakeApi({ logout: jest.fn().mockRejectedValue(new Error("offline")) });
    const props = appProps(api, true);
    await props.tokens.set({ access_token: "a", refresh_token: "r" } as never);
    await render(<App {...props} />);

    await fireEvent.press(await screen.findByRole("button", { name: "Log out" }));

    expect(await screen.findByRole("button", { name: "Log in" })).toBeTruthy();
    expect(api.logout).toHaveBeenCalled();
    expect(await props.tokens.get()).toBeNull();
  });

  it("opens the coach from the Today screen", async () => {
    await render(<App {...appProps(fakeApi(), true)} />);
    await fireEvent.press(await screen.findByRole("button", { name: "Ask your coach" }));
    expect(screen.getByRole("tab", { name: "Coach", selected: true })).toBeTruthy();
  });
});

it("reloads the goals when the Today tab is opened again", async () => {
  const api = fakeApi();
  await render(<App {...appProps(api, true)} />);
  await screen.findByRole("button", { name: "Ask your coach" });
  await fireEvent.press(screen.getByRole("tab", { name: "Coach" }));
  await fireEvent.press(screen.getByRole("tab", { name: "Today" }));
  await screen.findByRole("button", { name: "Ask your coach" });
  expect(api.listGoals).toHaveBeenCalledTimes(2);
});

describe("daysUntil", () => {
  const today = new Date(2026, 10, 18);
  it.each([
    ["2026-11-18", 0],
    ["2026-11-19", 1],
    ["2027-01-01", 44],
    ["2026-11-01", -17],
  ])("%s is %i days away", (date, days) => {
    expect(daysUntil(date, today)).toBe(days);
  });
});
