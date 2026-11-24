import { ApiError } from "@buddy/api-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { getLocales } from "expo-localization";

import App from "../App";
import { MESSAGES } from "../src/i18n/messages";
import { errorMessage } from "../src/lib/session";
import { appProps, fakeApi, goal, weight } from "../test/fakeApi";

const deviceLocales = getLocales as jest.Mock;

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

afterEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();
  deviceLocales.mockImplementation(() => [{ languageTag: "en-US", languageCode: "en" }]);
});

describe("Macedonian", () => {
  it("is chosen on Today, translates the tabs and the screen, and is remembered", async () => {
    const first = await render(<App {...appProps(fakeApi(), true)} />);
    await screen.findByRole("tab", { name: "Food" });

    await fireEvent.press(screen.getByRole("radio", { name: "Македонски" }));

    expect(screen.getByRole("tab", { name: "Исхрана" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Поврзувања" })).toBeTruthy();
    expect(screen.getByRole("header", { name: "Денес" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Одјави се" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Македонски", checked: true })).toBeTruthy();
    expect(await AsyncStorage.getItem("buddy-locale")).toBe("mk");

    await first.unmount();
    await render(<App {...appProps(fakeApi(), true)} />);
    expect(await screen.findByRole("tab", { name: "Напредок" })).toBeTruthy();
  });

  it("follows the device language when nothing is saved", async () => {
    deviceLocales.mockImplementation(() => [{ languageTag: "mk-MK", languageCode: "mk" }]);
    await render(<App {...appProps(fakeApi(), false)} />);
    expect(await screen.findByRole("button", { name: "Најави се" })).toBeTruthy();
    expect(screen.getByLabelText("Лозинка")).toBeTruthy();
  });

  it("can be chosen on the login screen", async () => {
    await render(<App {...appProps(fakeApi(), false)} />);
    await fireEvent.press(await screen.findByRole("radio", { name: "Македонски" }));
    expect(screen.getByRole("button", { name: "Најави се" })).toBeTruthy();
    expect(await AsyncStorage.getItem("buddy-locale")).toBe("mk");
  });

  it("shows nothing until the saved choice is read, so the phone's language never flashes", async () => {
    let read: (saved: string | null) => void = () => undefined;
    jest.spyOn(AsyncStorage, "getItem").mockImplementationOnce(() => new Promise((resolve) => (read = resolve)));
    await render(<App {...appProps(fakeApi(), false)} />);
    expect(screen.queryByRole("button", { name: "Log in" })).toBeNull();

    await act(async () => read("mk"));
    expect(await screen.findByRole("button", { name: "Најави се" })).toBeTruthy();
  });

  it("falls back to the phone's language when the saved choice cannot be read", async () => {
    deviceLocales.mockImplementation(() => [{ languageTag: "mk-MK", languageCode: "mk" }]);
    jest.spyOn(AsyncStorage, "getItem").mockRejectedValueOnce(new Error("storage unavailable"));
    await render(<App {...appProps(fakeApi(), false)} />);
    expect(await screen.findByRole("button", { name: "Најави се" })).toBeTruthy();
  });

  it("keeps a saved English choice on a Macedonian phone", async () => {
    await AsyncStorage.setItem("buddy-locale", "en");
    deviceLocales.mockImplementation(() => [{ languageTag: "mk-MK", languageCode: "mk" }]);
    await render(<App {...appProps(fakeApi(), false)} />);
    expect(await screen.findByRole("button", { name: "Log in" })).toBeTruthy();
  });

  it("shows a server error by its code, never the English text", async () => {
    deviceLocales.mockImplementation(() => [{ languageTag: "mk-MK", languageCode: "mk" }]);
    const login = jest.fn().mockRejectedValue(new ApiError(401, "unauthenticated", "Email or password is incorrect."));
    await render(<App {...appProps(fakeApi({ login }), false)} />);
    await fireEvent.changeText(await screen.findByLabelText("Е-пошта"), "ana@example.com");
    await fireEvent.changeText(screen.getByLabelText("Лозинка"), "a long password");
    await fireEvent.press(screen.getByRole("button", { name: "Најави се" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Е-поштата или лозинката не се точни, или најавата истече. Најави се повторно.",
    );
    expect(screen.queryByText(/incorrect/)).toBeNull();
  });

  it("translates network and unknown failures, and keeps English server texts in English", () => {
    expect(errorMessage(new TypeError("Network request failed"), "mk")).toBe(
      "Серверот не е достапен. Провери ја врската и обиди се повторно.",
    );
    expect(errorMessage(new ApiError(500, "something_new", "Boom"), "mk")).toBe("Нешто тргна наопаку. Обиди се повторно.");
    expect(errorMessage(new ApiError(422, "invalid_request", "Bad"), "mk")).toMatch(/Некои податоци не се точни/);
    expect(errorMessage(new ApiError(409, "conflict", "Email already registered."), "en")).toBe("Email already registered.");
  });

  it("uses Macedonian plurals and decimal commas", async () => {
    await AsyncStorage.setItem("buddy-locale", "mk");
    const api = fakeApi({
      listGoals: jest.fn().mockResolvedValue([goal({ target_date: isoInDays(21) })]),
      listWeights: jest.fn().mockResolvedValue({ weights: [weight(77.4)], trend: [] }),
    });
    await render(<App {...appProps(api, true)} />);

    expect(await screen.findByText("Уште 21 ден")).toBeTruthy();
    expect(screen.getByText("Издржливост (трка)")).toBeTruthy();
    expect(screen.getAllByText(/^77,4 кг/)).toHaveLength(2); // the latest weight and its list entry
    expect(screen.getByRole("button", { name: "Избриши 77,4 кг од 2026-11-19" })).toBeTruthy();
    expect(MESSAGES.mk.home.daysToGo(11)).toBe("Уште 11 дена");
    expect(MESSAGES.mk.connections.workouts(1, "")).toMatch(/^1 тренинг,/);
    expect(MESSAGES.mk.connections.workouts(5, "")).toMatch(/^5 тренинзи,/);
  });
});
