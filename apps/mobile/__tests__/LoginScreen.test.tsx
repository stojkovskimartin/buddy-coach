import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import App from "../App";
import { fakeApi } from "../test/fakeApi";

async function renderLoggedOut(api = fakeApi()) {
  await render(<App api={api} initialStatus="loggedOut" />);
  return api;
}

describe("LoginScreen", () => {
  it("logs in and shows the Today screen", async () => {
    const api = await renderLoggedOut();
    await fireEvent.changeText(screen.getByLabelText("Email"), " ana@example.com ");
    await fireEvent.changeText(screen.getByLabelText("Password"), "a long password");
    await fireEvent.press(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("header", { name: "Today" })).toBeTruthy();
    expect(api.login).toHaveBeenCalledWith("ana@example.com", "a long password");
  });

  it("keeps the button disabled until email and password are filled", async () => {
    await renderLoggedOut();
    expect(screen.getByRole("button", { name: "Log in" })).toBeDisabled();
  });

  it("asks for 12 characters when creating an account", async () => {
    const api = await renderLoggedOut();
    await fireEvent.press(screen.getByRole("button", { name: "Create an account" }));
    await fireEvent.changeText(screen.getByLabelText("Email"), "ana@example.com");
    await fireEvent.changeText(screen.getByLabelText("Password"), "short");

    expect(screen.getByText("At least 12 characters.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText("Password"), "a long password");
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(api.register).toHaveBeenCalled());
    expect(api.login).toHaveBeenCalledWith("ana@example.com", "a long password");
  });

  it("shows the error when login fails", async () => {
    await renderLoggedOut(fakeApi({ login: jest.fn().mockRejectedValue(new Error("Wrong email or password")) }));
    await fireEvent.changeText(screen.getByLabelText("Email"), "ana@example.com");
    await fireEvent.changeText(screen.getByLabelText("Password"), "a long password");
    await fireEvent.press(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong email or password");
  });
});
