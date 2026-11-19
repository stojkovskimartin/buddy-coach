import { memoryTokenStore } from "@buddy/api-client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { HealthSyncCard } from "../src/components/HealthSyncCard";
import type { SyncState } from "../src/health/sync";
import type { HealthSource } from "../src/health/types";
import { SessionProvider } from "../src/lib/session";
import { fakeApi } from "../test/fakeApi";

function memoryState(initial: Record<string, string> = {}): SyncState {
  const data = new Map(Object.entries(initial));
  return {
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    remove: async (k) => void data.delete(k),
  };
}

function fakeSource(granted = true): HealthSource {
  return {
    platform: "apple_health",
    availability: async () => "available",
    connect: jest.fn().mockResolvedValue(granted),
    readSince: jest.fn().mockResolvedValue({
      workouts: [
        { external_id: "1", activity: "running", started_at: "2026-11-18T07:00:00.000Z", duration_min: 30 },
        { external_id: "2", activity: "cycling", started_at: "2026-11-17T07:00:00.000Z", duration_min: 60 },
      ],
      nextCursor: "anchor",
    }),
  };
}

async function renderCard(source: HealthSource | null, state = memoryState(), api = fakeApi()) {
  await render(
    <SessionProvider createApi={() => api} tokens={memoryTokenStore()} restore={async () => true}>
      <HealthSyncCard source={source} state={state} />
    </SessionProvider>,
  );
  return api;
}

describe("HealthSyncCard", () => {
  it("explains when the phone cannot sync (Expo Go, other platforms)", async () => {
    await renderCard(null);
    expect(await screen.findByText(/needs the installed Buddy Coach app/)).toBeTruthy();
  });

  it("connects, syncs right away and reports what was added", async () => {
    const api = fakeApi({ importWorkouts: jest.fn().mockResolvedValue({ created: 2, updated: 0 }) });
    await renderCard(fakeSource(), memoryState(), api);

    await fireEvent.press(await screen.findByRole("button", { name: "Connect Apple Health" }));

    expect(await screen.findByText("2 new workouts.")).toBeTruthy();
    expect(api.importWorkouts).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Sync now" })).toBeTruthy();
  });

  it("says so when access is not granted", async () => {
    await renderCard(fakeSource(false));
    await fireEvent.press(await screen.findByRole("button", { name: "Connect Apple Health" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Apple Health access was not granted.");
  });

  it("syncs on open when already connected, and can stop syncing", async () => {
    const api = fakeApi({ importWorkouts: jest.fn().mockResolvedValue({ created: 0, updated: 2 }) });
    await renderCard(
      fakeSource(),
      memoryState({ "buddy-coach.health.apple_health.connected": "true" }),
      api,
    );
    expect(await screen.findByText("0 new workouts, 2 updated.")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Stop syncing Apple Health" }));
    expect(await screen.findByRole("button", { name: "Connect Apple Health" })).toBeTruthy();
  });

  it("shows a failed sync as an alert", async () => {
    const api = fakeApi({ importWorkouts: jest.fn().mockRejectedValue(new Error("Server unavailable")) });
    await renderCard(
      fakeSource(),
      memoryState({ "buddy-coach.health.apple_health.connected": "true" }),
      api,
    );
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Server unavailable"));
  });
});
