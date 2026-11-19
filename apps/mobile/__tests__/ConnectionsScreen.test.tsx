import { fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";

import App from "../App";
import { appProps, fakeApi } from "../test/fakeApi";

async function openConnections(api: ReturnType<typeof fakeApi>) {
  await render(<App {...appProps(api, true)} />);
  await fireEvent.press(await screen.findByRole("tab", { name: "Connect" }));
}

afterEach(() => jest.restoreAllMocks());

describe("ConnectionsScreen", () => {
  it("shows where data comes from and each account's state", async () => {
    const api = fakeApi({
      workoutSources: jest.fn().mockResolvedValue([{ source: "fit_file", workouts: 1, last_at: "2026-11-18T07:00:00Z" }]),
      weightSources: jest.fn().mockResolvedValue([{ source: "withings", weights: 12, last_at: "2026-11-19T06:00:00Z" }]),
      integrations: jest.fn().mockResolvedValue([
        { provider: "withings", available: true, connected: true, last_sync_at: null },
        { provider: "whoop", available: false, connected: false, last_sync_at: null },
      ]),
    });
    await openConnections(api);

    expect(await screen.findByText(/1 workout, latest/)).toBeTruthy();
    expect(screen.getByText(/12 weights, latest/)).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.getByText("Not set up on this server yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sync WHOOP now" })).toBeNull();
  });

  it("syncs, and disconnects after confirming", async () => {
    const api = fakeApi({
      integrations: jest.fn().mockResolvedValue([{ provider: "whoop", available: true, connected: true, last_sync_at: null }]),
      syncIntegration: jest.fn().mockResolvedValue({ synced: true, last_sync_at: null, created: 2, updated: 0, skipped: 0 }),
    });
    jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.[1]?.onPress?.());
    await openConnections(api);

    await fireEvent.press(await screen.findByRole("button", { name: "Sync WHOOP now" }));
    expect(await screen.findByText("2 new workouts.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Disconnect WHOOP" }));
    expect(api.disconnectIntegration).toHaveBeenCalledWith("whoop");
    expect(api.integrations).toHaveBeenCalledTimes(3); // shown, after sync, after disconnect
  });

  it("shows a failed sync", async () => {
    const api = fakeApi({
      integrations: jest.fn().mockResolvedValue([{ provider: "whoop", available: true, connected: true, last_sync_at: null }]),
      syncIntegration: jest.fn().mockRejectedValue(new Error("WHOOP could not answer right now.")),
    });
    await openConnections(api);
    await fireEvent.press(await screen.findByRole("button", { name: "Sync WHOOP now" }));
    expect(await screen.findByText("WHOOP could not answer right now.")).toBeTruthy();
  });
});
