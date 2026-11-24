import { useId, type ReactNode } from "react";

import { useI18n } from "../i18n";
import { MoonIcon, SunIcon, SystemIcon } from "./icons";
import { useTheme, type Theme } from "./theme";

const THEMES: { value: Theme; icon: ReactNode }[] = [
  { value: "light", icon: <SunIcon /> },
  { value: "dark", icon: <MoonIcon /> },
  { value: "system", icon: <SystemIcon /> },
];

/** Light, dark or the device's setting; in the menu and on the settings page. */
export function ThemeSwitcher() {
  const [theme, setTheme] = useTheme();
  const { t } = useI18n();
  const name = useId(); // two switchers can be on screen; each needs its own radio group
  return (
    <fieldset className="theme-switcher">
      <legend className="visually-hidden">{t.shell.theme}</legend>
      {THEMES.map((option) => (
        <label
          key={option.value}
          title={t.shell.themes[option.value]}
          className={theme === option.value ? "selected" : ""}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={theme === option.value}
            onChange={() => setTheme(option.value)}
          />
          {option.icon}
          <span className="visually-hidden">{t.shell.themes[option.value]}</span>
        </label>
      ))}
    </fieldset>
  );
}
