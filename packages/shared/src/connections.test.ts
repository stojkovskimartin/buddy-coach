import { describe, expect, it } from "vitest";

import { importText, weightSyncText } from "./connections";

describe("importText", () => {
  it("counts new and updated workouts", () => {
    expect(importText({ created: 1, updated: 0 })).toBe("1 new workout");
    expect(importText({ created: 0, updated: 2 })).toBe("0 new workouts, 2 updated");
  });
});

describe("weightSyncText", () => {
  it("counts weights and explains a skipped or empty sync", () => {
    expect(weightSyncText({ synced: true, created: 1, updated: 0 })).toBe("1 new weight");
    expect(weightSyncText({ synced: true, created: 3, updated: 2 })).toBe("3 new weights, 2 updated");
    expect(weightSyncText({ synced: true, created: 0, updated: 0 })).toBe("No new weights");
    expect(weightSyncText({ synced: false, created: 0, updated: 0 })).toMatch(/10 minutes/);
  });
});
