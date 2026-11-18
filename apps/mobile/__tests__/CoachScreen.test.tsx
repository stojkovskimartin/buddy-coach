import { fireEvent, render, screen } from "@testing-library/react-native";

import App from "../App";
import { fakeApi, reply } from "../test/fakeApi";

async function openCoach(api = fakeApi()) {
  await render(<App api={api} initialStatus="loggedIn" />);
  await fireEvent.press(screen.getByRole("tab", { name: "Coach" }));
  await screen.findByLabelText("Your message");
  return api;
}

describe("CoachScreen", () => {
  it("sends a message and shows the coach reply with the specialist", async () => {
    const api = await openCoach();
    await fireEvent.changeText(screen.getByLabelText("Your message"), "  What after intervals?  ");
    await fireEvent.press(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Eat 30 g protein after training.")).toBeTruthy();
    expect(screen.getByText("Nutrition")).toBeTruthy();
    expect(api.chat).toHaveBeenCalledWith("What after intervals?");
  });

  it("sends a suggestion with one tap", async () => {
    const api = await openCoach();
    await fireEvent.press(screen.getByRole("button", { name: "Should I take creatine?" }));
    await screen.findByTestId("turn-coach");
    expect(api.chat).toHaveBeenCalledWith("Should I take creatine?");
  });

  it("marks escalated replies as important alerts", async () => {
    await openCoach(
      fakeApi({
        chat: jest.fn().mockResolvedValue(
          reply({ escalated: true, reply: "Please call 144 now.", safety_category: "emergency" }),
        ),
      }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Should I take creatine?" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Important/);
    expect(alert).toHaveTextContent(/Please call 144 now/);
  });

  it("shows a failed request as an alert", async () => {
    await openCoach(fakeApi({ chat: jest.fn().mockRejectedValue(new Error("Network error")) }));
    await fireEvent.press(screen.getByRole("button", { name: "Should I take creatine?" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not reach your coach/);
  });

  it("does not send empty messages", async () => {
    const api = await openCoach();
    await fireEvent.changeText(screen.getByLabelText("Your message"), "   ");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(api.chat).not.toHaveBeenCalled();
  });
});
