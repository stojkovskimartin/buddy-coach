import { LOCALES, LOCALE_NAMES, type Locale } from "@buddy/shared";
import { useId } from "react";

import { useSession, type CoachApi } from "../lib/session";
import { useI18n } from ".";

/** In each language's own script. */
const SHORT: Record<Locale, string> = { en: "EN", mk: "МК" };

/** The coach writes in the profile's language, so a logged-in choice is saved there too. Without
 * a profile (before onboarding) or when saving fails, the choice applies on this device only. */
async function saveInProfile(api: CoachApi, locale: Locale): Promise<void> {
  try {
    const profile = await api.getProfile();
    if (!profile || profile.locale === locale) return;
    const { user_id, updated_at, ...fields } = profile;
    await api.saveProfile({ ...fields, locale });
  } catch {
    // The screen already switched; the profile follows the next time.
  }
}

/** English or Macedonian, shown in each language's own name; in the menu and on the login and
 * settings pages. The one place a language choice is made and saved. */
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const { api, loggedIn } = useSession();
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
              if (loggedIn) void saveInProfile(api, option);
            }}
          />
          <span aria-hidden="true">{SHORT[option]}</span>
          <span className="visually-hidden">{LOCALE_NAMES[option]}</span>
        </label>
      ))}
    </fieldset>
  );
}
