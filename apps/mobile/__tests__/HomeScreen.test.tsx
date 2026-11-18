import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import App from "../App";
import { daysUntil } from "../src/screens/HomeScreen";
import { fakeApi, goal } from "../test/fakeApi";

describe("HomeScreen", () => {
  it("shows the main goal with a countdown", async () => {
    const date = new Date();
    date.setDate(date.getDate() + 10);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const api = fakeApi({ listGoals: jest.fn().mockResolvedValue([goal({ target_date: iso })]) });
    await render(<App api={api} initialStatus="loggedIn" />);

    expect(await screen.findByText("Zurich Marathon")).toBeTruthy();
    expect(screen.getByText("Endurance event")).toBeTruthy();
    expect(screen.getByText("10 days to go")).toBeTruthy();
    expect(api.listGoals).toHaveBeenCalledWith("active");
  });

  it("asks to set up the profile when there is none", async () => {
    await render(
      <App api={fakeApi({ getProfile: jest.fn().mockResolvedValue(null) })} initialStatus="loggedIn" />,
    );
    expect(await screen.findByText("Set up your profile")).toBeTruthy();
  });

  it("shows an error when loading fails", async () => {
    await render(
      <App
        api={fakeApi({ listGoals: jest.fn().mockRejectedValue(new Error("Server unavailable")) })}
        initialStatus="loggedIn"
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Server unavailable");
  });

  it("logs out even when the server cannot be reached", async () => {
    const api = fakeApi({ logout: jest.fn().mockRejectedValue(new Error("offline")) });
    await render(<App api={api} initialStatus="loggedIn" />);
    await fireEvent.press(await screen.findByRole("button", { name: "Log out" }));
    expect(await screen.findByRole("button", { name: "Log in" })).toBeTruthy();
  });

  it("opens the coach from the Today screen", async () => {
    await render(<App api={fakeApi()} initialStatus="loggedIn" />);
    await fireEvent.press(await screen.findByRole("button", { name: "Ask your coach" }));
    await waitFor(() => expect(screen.getByLabelText("Your message")).toBeTruthy());
  });
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
