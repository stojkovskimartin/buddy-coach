import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo, Platform } from "react-native";

import App from "../App";
import { appProps, fakeApi, reply } from "../test/fakeApi";

async function openCoach(api = fakeApi()) {
  await render(<App {...appProps(api, true)} />);
  await fireEvent.press(await screen.findByRole("tab", { name: "Coach" }));
  return api;
}

const SUGGESTION = { name: "Should I take creatine?" };

describe("CoachScreen", () => {
  afterEach(() => jest.restoreAllMocks());

  it("sends a trimmed message and shows the reply with the specialist", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const api = await openCoach();
    await fireEvent.changeText(screen.getByLabelText("Your message"), "  What after intervals?  ");
    await fireEvent.press(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Eat 30 g protein after training.")).toBeTruthy();
    expect(screen.getByText("Nutrition")).toBeTruthy();
    expect(api.chat).toHaveBeenCalledWith("What after intervals?");
    expect(announce).toHaveBeenCalledWith("Eat 30 g protein after training.");
  });

  it("sends only once on a double tap", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    const api = await openCoach(
      fakeApi({ chat: jest.fn(() => new Promise((r) => (resolve = r))) }),
    );
    await fireEvent.changeText(screen.getByLabelText("Your message"), "Hi coach");
    const send = screen.getByRole("button", { name: "Send" });
    // Two presses in the same tick, before React re-renders and disables the button:
    // only the ref guard can stop the second one.
    const click = send.props.onClick as (event: object) => void;
    const event = { nativeEvent: {}, persist: () => undefined };
    await act(async () => {
      click(event);
      click(event);
    });
    resolve(reply());
    await screen.findByTestId("turn-coach");
    expect(api.chat).toHaveBeenCalledTimes(1);
    expect(api.chat).toHaveBeenCalledWith("Hi coach");
  });

  it("marks escalated replies as important alerts", async () => {
    await openCoach(
      fakeApi({
        chat: jest.fn().mockResolvedValue(
          reply({ escalated: true, reply: "Please call 144 now.", safety_category: "emergency" }),
        ),
      }),
    );
    await fireEvent.press(screen.getByRole("button", SUGGESTION));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Important/);
    expect(alert).toHaveTextContent(/Please call 144 now/);
  });

  it("says when the AI was unavailable and a short answer was used", async () => {
    await openCoach(fakeApi({ chat: jest.fn().mockResolvedValue(reply({ degraded: true })) }));
    await fireEvent.press(screen.getByRole("button", SUGGESTION));
    expect(await screen.findByText(/the AI coach was unavailable/)).toBeTruthy();
  });

  it("shows a failed request as an alert", async () => {
    await openCoach(fakeApi({ chat: jest.fn().mockRejectedValue(new Error("Network error")) }));
    await fireEvent.press(screen.getByRole("button", SUGGESTION));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not reach your coach/);
  });

  it("keeps the conversation when switching tabs", async () => {
    await openCoach();
    await fireEvent.press(screen.getByRole("button", SUGGESTION));
    await screen.findByTestId("turn-coach");
    await fireEvent.press(screen.getByRole("tab", { name: "Today" }));
    await fireEvent.press(screen.getByRole("tab", { name: "Coach" }));
    expect(screen.getByText("Eat 30 g protein after training.")).toBeTruthy();
  });

  it("does not send empty messages", async () => {
    const api = await openCoach();
    await fireEvent.changeText(screen.getByLabelText("Your message"), "   ");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await waitFor(() => expect(api.chat).not.toHaveBeenCalled());
  });
});
