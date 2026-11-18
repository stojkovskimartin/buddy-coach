import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import App from "../App";
import { appProps, fakeApi } from "../test/fakeApi";

async function renderLoggedOut(api = fakeApi()) {
  await render(<App {...appProps(api, false)} />);
  await screen.findByRole("button", { name: "Log in" });
  return api;
}

async function fill(email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText("Email"), email);
  await fireEvent.changeText(screen.getByLabelText("Password"), password);
}

describe("LoginScreen", () => {
  it("logs in with a trimmed email and shows the Today screen", async () => {
    const api = await renderLoggedOut();
    await fill(" ana@example.com ", "a long password");
    await fireEvent.press(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("header", { name: "Today" })).toBeTruthy();
    expect(api.login).toHaveBeenCalledWith("ana@example.com", "a long password");
  });

  it("enables the button only when email and password are filled", async () => {
    await renderLoggedOut();
    expect(screen.getByRole("button", { name: "Log in" })).toBeDisabled();
    await fill("ana@example.com", "x");
    expect(screen.getByRole("button", { name: "Log in" })).toBeEnabled();
  });

  it("asks for 10 characters when creating an account, like the API", async () => {
    const api = await renderLoggedOut();
    await fireEvent.press(screen.getByRole("button", { name: "Create an account" }));
    await fill("ana@example.com", "123456789");

    expect(screen.getByText("At least 10 characters.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText("Password"), "1234567890");
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(api.login).toHaveBeenCalledWith("ana@example.com", "1234567890"));
    expect(api.register).toHaveBeenCalledWith("ana@example.com", "1234567890");
  });

  it("limits the password to 128 characters", async () => {
    await renderLoggedOut();
    expect(screen.getByLabelText("Password")).toHaveProp("maxLength", 128);
  });

  it("shows the error when login fails", async () => {
    await renderLoggedOut(
      fakeApi({ login: jest.fn().mockRejectedValue(new Error("Wrong email or password")) }),
    );
    await fill("ana@example.com", "a long password");
    await fireEvent.press(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong email or password");
  });
});
