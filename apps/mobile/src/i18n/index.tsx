import { SHARED_TEXT, mkNumber, pickLocale, type Locale, type SharedText } from "@buddy/shared";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

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

const I18nContext = createContext<I18n | null>(null);

/** The saved choice, else the device's languages, else English. Shows nothing until the saved
 * choice is read (a moment on start), so the device's language never flashes first. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale | null>(null);

  useEffect(() => {
    let active = true;
    const settle = (saved: string | null) => active && setLocaleState(pickLocale(saved, deviceLanguages()));
    AsyncStorage.getItem(LOCALE_KEY).then(settle, () => settle(null));
    return () => {
      active = false;
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    AsyncStorage.setItem(LOCALE_KEY, next).catch(() => undefined); // still applies until restart
  }, []);

  if (locale) current = locale; // also during the first render, before effects run

  const value = useMemo(() => (locale ? i18n(locale, setLocale) : null), [locale, setLocale]);
  if (!value) return null;
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n needs an I18nProvider");
  return value;
}

/** A failure whose text is already in the user's language (e.g. "no food with this barcode"). */
export class LocalizedError extends Error {}
