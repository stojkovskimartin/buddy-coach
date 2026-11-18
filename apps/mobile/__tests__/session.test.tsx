import { memoryTokenStore } from "@buddy/api-client";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import App from "../App";
import { apiBaseUrl, type CreateApi } from "../src/lib/session";
import { fakeApi } from "../test/fakeApi";

describe("session", () => {
  it("shows the login screen with a notice when the server ends the session", async () => {
    let expire: () => void = () => undefined;
    const createApi: CreateApi = (_tokens, onExpired) => {
      expire = onExpired;
      return fakeApi();
    };
    await render(
      <App createApi={createApi} tokens={memoryTokenStore()} restore={async () => true} />,
    );
    await screen.findByRole("header", { name: "Today" });

    await act(async () => expire());

    expect(await screen.findByText("Your session expired. Please log in again.")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Email"), "ana@example.com");
    await fireEvent.changeText(screen.getByLabelText("Password"), "a long password");
    await fireEvent.press(screen.getByRole("button", { name: "Log in" }));
    await screen.findByRole("header", { name: "Today" });
  });

  it("starts on the login screen when the startup check fails", async () => {
    await render(
      <App
        createApi={() => fakeApi()}
        tokens={memoryTokenStore()}
        restore={() => Promise.reject(new Error("keychain locked"))}
      />,
    );
    expect(await screen.findByRole("button", { name: "Log in" })).toBeTruthy();
  });
});

describe("apiBaseUrl", () => {
  it("falls back to localhost in development, also for an empty value", () => {
    expect(apiBaseUrl(undefined, true)).toBe("http://localhost:8000");
    expect(apiBaseUrl("  ", true)).toBe("http://localhost:8000");
    expect(apiBaseUrl("http://192.168.1.20:8000", true)).toBe("http://192.168.1.20:8000");
  });

  it("requires https in release builds", () => {
    expect(apiBaseUrl("https://api.buddycoach.ch", false)).toBe("https://api.buddycoach.ch");
    expect(() => apiBaseUrl("http://api.buddycoach.ch", false)).toThrow(/https/);
    expect(() => apiBaseUrl(undefined, false)).toThrow(/https/);
  });
});
