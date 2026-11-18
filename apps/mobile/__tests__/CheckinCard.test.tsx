import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { AccessibilityInfo, Platform } from "react-native";

import App from "../App";
import { appProps, checkin, fakeApi } from "../test/fakeApi";

const SCALES: Record<string, string> = {
  "How did you sleep?": "scale-sleep_quality",
  "How do your muscles feel?": "scale-soreness",
  "How do you feel?": "scale-mood",
};
const QUESTIONS = Object.keys(SCALES);

/** The radio group is not itself an accessibility element (its options are), so find it by id. */
function scale(question: string) {
  return screen.getByTestId(SCALES[question]!);
}

async function answer(question: string, value: number) {
  const label = new RegExp(`^${question.replace("?", "\\?")} ${value} of 5`);
  await fireEvent.press(within(scale(question)).getByRole("radio", { name: label }));
}

async function answerAll(value: number) {
  for (const q of QUESTIONS) await answer(q, value);
}

describe("CheckinCard", () => {
  afterEach(() => jest.restoreAllMocks());

  it("takes three taps, lets the server pick today and shows readiness", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const api = fakeApi();
    await render(<App {...appProps(api, true)} />);
    const save = await screen.findByRole("button", { name: "Save check-in" });
    expect(save).toBeDisabled();

    await answer("How did you sleep?", 4);
    await answer("How do your muscles feel?", 2);
    await answer("How do you feel?", 5);
    await fireEvent.changeText(screen.getByLabelText("Hours of sleep (optional)"), "7,5");
    await fireEvent.press(screen.getByRole("button", { name: "Save check-in" }));

    expect(api.saveTodayCheckin).toHaveBeenCalledWith({
      sleep_quality: 4,
      soreness: 2,
      mood: 5,
      pain: false,
      sleep_hours: 7.5,
    });
    expect(api.saveCheckin).not.toHaveBeenCalled();
    expect(await screen.findByText("Readiness 81/100")).toBeTruthy();
    expect(screen.getByText("Good to train as planned.")).toBeTruthy();
    expect(screen.getByText(/not medical advice/)).toBeTruthy();
    expect(announce).toHaveBeenCalledWith("Readiness 81 of 100. Good to train as planned.");
  });

  it("names the question in every option and marks the chosen one", async () => {
    await render(<App {...appProps(fakeApi(), true)} />);
    await screen.findByRole("button", { name: "Save check-in" });
    await answer("How did you sleep?", 3);
    const option = within(scale("How did you sleep?")).getByRole("radio", {
      name: "How did you sleep? 3 of 5",
    });
    expect(option).toBeChecked();
  });

  it("toggles pain from the whole row, read as one switch", async () => {
    const api = fakeApi();
    await render(<App {...appProps(api, true)} />);
    await screen.findByRole("button", { name: "Save check-in" });
    const row = screen.getByRole("switch", { name: /I have pain today/ });
    expect(row).not.toBeChecked();
    await fireEvent.press(row);
    expect(row).toBeChecked();
    await answerAll(3);
    await fireEvent.press(screen.getByRole("button", { name: "Save check-in" }));
    await waitFor(() =>
      expect(api.saveTodayCheckin).toHaveBeenCalledWith(expect.objectContaining({ pain: true })),
    );
  });

  it("refuses impossible sleep hours", async () => {
    await render(<App {...appProps(fakeApi(), true)} />);
    await screen.findByRole("button", { name: "Save check-in" });
    await answerAll(3);
    await fireEvent.changeText(screen.getByLabelText("Hours of sleep (optional)"), "20");
    expect(screen.getByText("Enter 0 to 16 hours.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save check-in" })).toBeDisabled();
  });

  it("shows what holds readiness back and saves changes to the loaded day", async () => {
    const loadedDay = "2026-11-17"; // the profile's day can differ from the phone's
    const today = checkin(
      loadedDay,
      { sleep_quality: 1, soreness: 2, mood: 3, pain: true },
      { score: 20, level: "red", limiting_factors: ["sleep", "pain"] },
    );
    const api = fakeApi({ getTodayCheckin: jest.fn().mockResolvedValue(today) });
    await render(<App {...appProps(api, true)} />);

    expect(await screen.findByText("Consider rest or light recovery today.")).toBeTruthy();
    expect(screen.getByText("Held back by: sleep, pain.")).toBeTruthy();
    expect(screen.getByText(/get medical help now/)).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Change today's answers" }));
    expect(
      within(scale("How did you sleep?")).getByRole("radio", { name: /^How did you sleep\? 1 of 5/ }),
    ).toBeChecked();
    expect(screen.getByRole("switch", { name: /I have pain today/ })).toBeChecked();
    await answer("How did you sleep?", 3);
    await fireEvent.press(screen.getByRole("button", { name: "Save check-in" }));

    await waitFor(() =>
      expect(api.saveCheckin).toHaveBeenCalledWith(
        loadedDay,
        expect.objectContaining({ sleep_quality: 3 }),
      ),
    );
    expect(api.saveTodayCheckin).not.toHaveBeenCalled();
  });

  it("never shows an empty form when loading fails, and can try again", async () => {
    const getTodayCheckin = jest
      .fn()
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(null);
    await render(<App {...appProps(fakeApi({ getTodayCheckin }), true)} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Network error");
    expect(screen.queryByRole("button", { name: "Save check-in" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Save check-in" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("loads once on start and again when the Today tab is shown again", async () => {
    const api = fakeApi();
    await render(<App {...appProps(api, true)} />);
    await screen.findByRole("button", { name: "Save check-in" });
    expect(api.getTodayCheckin).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole("tab", { name: "Coach" }));
    await fireEvent.press(screen.getByRole("tab", { name: "Today" }));
    await waitFor(() => expect(api.getTodayCheckin).toHaveBeenCalledTimes(2));
  });

  it("keeps typed answers when the Today tab is shown again", async () => {
    const getTodayCheckin = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("Offline"));
    await render(<App {...appProps(fakeApi({ getTodayCheckin }), true)} />);
    await screen.findByRole("button", { name: "Save check-in" });
    await answer("How did you sleep?", 2);

    await fireEvent.press(screen.getByRole("tab", { name: "Coach" }));
    await fireEvent.press(screen.getByRole("tab", { name: "Today" }));

    expect(await screen.findByText("Offline")).toBeTruthy();
    expect(
      within(scale("How did you sleep?")).getByRole("radio", { name: /^How did you sleep\? 2 of 5/ }),
    ).toBeChecked();
  });

  it("shows the error when saving fails and clears it on the next try", async () => {
    const saveTodayCheckin = jest
      .fn()
      .mockRejectedValueOnce(new Error("Server down"))
      .mockImplementationOnce(async (c) => checkin("2026-11-19", c));
    await render(<App {...appProps(fakeApi({ saveTodayCheckin }), true)} />);
    await screen.findByRole("button", { name: "Save check-in" });
    await answerAll(3);
    await fireEvent.press(screen.getByRole("button", { name: "Save check-in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Server down");

    await fireEvent.press(screen.getByRole("button", { name: "Save check-in" }));
    expect(await screen.findByText("Readiness 81/100")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
