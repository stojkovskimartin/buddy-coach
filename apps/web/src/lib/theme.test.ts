import { applyTheme, savedTheme, THEME_KEY } from "./theme";

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  vi.restoreAllMocks();
});

it("follows the device until a choice is saved", () => {
  expect(savedTheme()).toBe("system");
  window.localStorage.setItem(THEME_KEY, "dark");
  expect(savedTheme()).toBe("dark");
  window.localStorage.setItem(THEME_KEY, "purple");
  expect(savedTheme()).toBe("system");
});

it("still applies the choice when storage is blocked", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("blocked", "SecurityError");
  });
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("blocked", "SecurityError");
  });
  applyTheme("light");
  expect(document.documentElement).toHaveAttribute("data-theme", "light");
  expect(savedTheme()).toBe("system");
});

it("matches the key the first-paint script reads", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const script = readFileSync(join(__dirname, "../../public/theme-init.js"), "utf8");
  expect(script).toContain(`window.localStorage.getItem("${THEME_KEY}")`);
});
