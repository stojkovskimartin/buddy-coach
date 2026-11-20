import { useCallback, useState } from "react";

/** "system" follows the device; the others are a saved choice. */
export type Theme = "light" | "dark" | "system";

/** Also read by public/theme-init.js, which applies the choice before the first paint. */
export const THEME_KEY = "buddy-theme";

/** The saved choice; "system" when none is saved or storage is blocked. */
export function savedTheme(): Theme {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    if (value === "light" || value === "dark") return value;
  } catch {
    // Storage blocked (private mode, settings): fall back to the device.
  }
  return "system";
}

/** Apply the choice to <html> and remember it on this device. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  try {
    if (theme === "system") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Not remembered; it still applies until the page is reloaded.
  }
}

/** The current choice and a setter that applies and saves it. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(savedTheme);
  const choose = useCallback((next: Theme) => {
    applyTheme(next);
    setTheme(next);
  }, []);
  return [theme, choose];
}
