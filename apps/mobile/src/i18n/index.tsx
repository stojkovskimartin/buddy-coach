import { SHARED_TEXT, mkNumber, pickLocale, type Locale, type SharedText } from "@buddy/shared";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { MESSAGES, type Messages } from "./messages";

export type { Locale };

const LOCALE_KEY = "buddy-locale";

/** The language in use, also for code outside React (error texts). */
let current: Locale = "en";

export function currentLocale(): Locale {
  return current;
}

function deviceLanguages(): string[] {
  return getLocales().map((l) => l.languageTag);
}

interface I18n {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** This app's texts. */
  t: Messages;
  /** Wording shared with the web app. */
  s: SharedText;
  /** A decimal number as written in this language: 77.4 or 77,4. */
  num: (value: number | string) => string;
}

function i18n(locale: Locale, setLocale: (locale: Locale) => void): I18n {
  return {
    locale,
    setLocale,
    t: MESSAGES[locale],
    s: SHARED_TEXT[locale],
    num: (value) => (locale === "mk" ? mkNumber(value) : String(value)),
  };
}

/** English for components shown without the provider (component tests). */
const I18nContext = createContext<I18n>(i18n("en", () => undefined));

/** The saved choice, else the device's languages, else English. The saved choice is read once on
 * start; until then the device's language is shown. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => pickLocale(null, deviceLanguages()));
  const chosen = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(LOCALE_KEY)
      .then((saved) => {
        if (!chosen.current) setLocaleState(pickLocale(saved, deviceLanguages()));
      })
      .catch(() => undefined); // keep the device's language
  }, []);

  const setLocale = useCallback((next: Locale) => {
    chosen.current = true;
    setLocaleState(next);
    AsyncStorage.setItem(LOCALE_KEY, next).catch(() => undefined); // still applies until restart
  }, []);

  current = locale; // also during the first render, before effects run

  const value = useMemo(() => i18n(locale, setLocale), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}

/** A failure whose text is already in the user's language (e.g. "no food with this barcode"). */
export class LocalizedError extends Error {}
