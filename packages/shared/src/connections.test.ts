import { describe, expect, it } from "vitest";

import { importText } from "./connections";

describe("importText", () => {
  it("counts new and updated workouts", () => {
    expect(importText({ created: 1, updated: 0 })).toBe("1 new workout");
    expect(importText({ created: 0, updated: 2 })).toBe("0 new workouts, 2 updated");
  });
});
