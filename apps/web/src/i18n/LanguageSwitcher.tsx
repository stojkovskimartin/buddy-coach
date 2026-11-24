import { LOCALES, LOCALE_NAMES, type Locale } from "@buddy/shared";
import { useId } from "react";

import { useI18n } from ".";

/** In each language's own script. */
const SHORT: Record<Locale, string> = { en: "EN", mk: "МК" };

/** English or Macedonian, shown in each language's own name; also on the login and settings
 * pages. `onChange` runs after the language was switched (the settings page saves it). */
export function LanguageSwitcher({ onChange }: { onChange?: (locale: Locale) => void } = {}) {
  const { locale, setLocale, t } = useI18n();
  const name = useId(); // two switchers can be on screen; each needs its own radio group
  return (
    <fieldset className="language-switcher">
      <legend className="visually-hidden">{t.shell.language}</legend>
      {LOCALES.map((option: Locale) => (
        <label key={option} className={locale === option ? "selected" : ""} lang={option}>
          <input
            type="radio"
            name={name}
            value={option}
            checked={locale === option}
            onChange={() => {
              setLocale(option);
              onChange?.(option);
            }}
          />
          <span aria-hidden="true">{SHORT[option]}</span>
          <span className="visually-hidden">{LOCALE_NAMES[option]}</span>
        </label>
      ))}
    </fieldset>
  );
}
