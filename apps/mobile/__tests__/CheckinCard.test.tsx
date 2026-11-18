import { fireEvent, render, screen, within } from "@testing-library/react-native";

import App from "../App";
import { localIsoDate } from "../src/components/CheckinCard";
import { appProps, checkin, fakeApi } from "../test/fakeApi";

const SCALES: Record<string, string> = {
  "How did you sleep?": "scale-sleep_quality",
  "How do your muscles feel?": "scale-soreness",
  "How do you feel?": "scale-mood",
};

/** The radio group is not itself an accessibility element (its options are), so find it by id. */
function scale(question: string) {
  return screen.getByTestId(SCALES[question]!);
}

async function answer(question: string, label: RegExp) {
  const group = scale(question);
  await fireEvent.press(within(group).getByRole("radio", { name: label }));
}

describe("CheckinCard", () => {
  it("takes three taps and shows today's readiness", async () => {
    const api = fakeApi();
    await render(<App {...appProps(api, true)} />);
    const save = await screen.findByRole("button", { name: "Save check-in" });
    expect(save).toBeDisabled();

    await answer("How did you sleep?", /^4 of 5/);
    await answer("How do your muscles feel?", /^2 of 5/);
    await answer("How do you feel?", /^5 of 5/);
    await fireEvent.changeText(screen.getByLabelText("Hours of sleep (optional)"), "7,5");
    await fireEvent.press(screen.getByRole("button", { name: "Save check-in" }));

    expect(api.saveCheckin).toHaveBeenCalledWith(localIsoDate(), {
      sleep_quality: 4,
      soreness: 2,
      mood: 5,
      pain: false,
      sleep_hours: 7.5,
    });
    expect(await screen.findByText("Readiness 81/100")).toBeTruthy();
    expect(screen.getByText("Ready to train as planned.")).toBeTruthy();
  });

  it("marks the chosen answer as checked", async () => {
    await render(<App {...appProps(fakeApi(), true)} />);
    await screen.findByRole("button", { name: "Save check-in" });
    await answer("How did you sleep?", /^3 of 5/);
    const group = scale("How did you sleep?");
    expect(within(group).getByRole("radio", { name: /^3 of 5/ })).toBeChecked();
  });

  it("refuses impossible sleep hours", async () => {
    await render(<App {...appProps(fakeApi(), true)} />);
    await screen.findByRole("button", { name: "Save check-in" });
    for (const q of ["How did you sleep?", "How do your muscles feel?", "How do you feel?"]) {
      await answer(q, /^3 of 5/);
    }
    await fireEvent.changeText(screen.getByLabelText("Hours of sleep (optional)"), "20");
    expect(screen.getByText("Enter 0 to 16 hours.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save check-in" })).toBeDisabled();
  });

  it("shows what holds readiness back and lets the athlete change the answers", async () => {
    const today = checkin(
      localIsoDate(),
      { sleep_quality: 1, soreness: 2, mood: 3, pain: true },
      { score: 20, level: "red", limiting_factors: ["sleep", "pain"] },
    );
    await render(
      <App {...appProps(fakeApi({ getTodayCheckin: jest.fn().mockResolvedValue(today) }), true)} />,
    );

    expect(await screen.findByText("Rest or recovery only today.")).toBeTruthy();
    expect(screen.getByText("Held back by: sleep, pain.")).toBeTruthy();
    expect(screen.getByText(/You reported pain/)).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Change today's answers" }));
    const sleep = scale("How did you sleep?");
    expect(within(sleep).getByRole("radio", { name: /^1 of 5/ })).toBeChecked();
    expect(screen.getByLabelText("I have pain today")).toHaveProp("value", true);
  });

  it("shows the error when saving fails", async () => {
    const api = fakeApi({ saveCheckin: jest.fn().mockRejectedValue(new Error("Server down")) });
    await render(<App {...appProps(api, true)} />);
    await screen.findByRole("button", { name: "Save check-in" });
    for (const q of ["How did you sleep?", "How do your muscles feel?", "How do you feel?"]) {
      await answer(q, /^3 of 5/);
    }
    await fireEvent.press(screen.getByRole("button", { name: "Save check-in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Server down");
  });
});

describe("localIsoDate", () => {
  it("uses the phone's calendar day", () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
