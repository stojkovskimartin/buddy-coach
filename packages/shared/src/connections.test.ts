import { describe, expect, it } from "vitest";

import { importText, syncText } from "./connections";

describe("importText", () => {
  it("counts new and updated workouts", () => {
    expect(importText({ created: 1, updated: 0 })).toBe("1 new workout");
    expect(importText({ created: 0, updated: 2 })).toBe("0 new workouts, 2 updated");
  });
});

describe("syncText", () => {
  it("counts weights or workouts and explains a skipped or empty sync", () => {
    expect(syncText({ synced: true, created: 1, updated: 0 }, "weight")).toBe("1 new weight");
    expect(syncText({ synced: true, created: 3, updated: 2 }, "workout")).toBe("3 new workouts, 2 updated");
    expect(syncText({ synced: true, created: 0, updated: 0 }, "weight")).toBe("No new weights");
    expect(syncText({ synced: false, created: 0, updated: 0 }, "workout")).toMatch(/10 minutes/);
  });
});
