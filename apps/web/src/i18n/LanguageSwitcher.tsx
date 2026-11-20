import { LOCALES, LOCALE_NAMES, type Locale } from "@buddy/shared";

import { useI18n } from ".";

/** In each language's own script. */
const SHORT: Record<Locale, string> = { en: "EN", mk: "МК" };

/** English or Macedonian, shown in each language's own name; also on the login page. */
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <fieldset className="language-switcher">
      <legend className="visually-hidden">{t.shell.language}</legend>
      {LOCALES.map((option: Locale) => (
        <label key={option} className={locale === option ? "selected" : ""} lang={option}>
          <input
            type="radio"
            name="language"
            value={option}
            checked={locale === option}
            onChange={() => setLocale(option)}
          />
          <span aria-hidden="true">{SHORT[option]}</span>
          <span className="visually-hidden">{LOCALE_NAMES[option]}</span>
        </label>
      ))}
    </fieldset>
  );
}
