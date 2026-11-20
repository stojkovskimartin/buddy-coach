import { ApiError } from "@buddy/api-client";
import { SHARED_TEXT, pickLocale, type Locale, type SharedText } from "@buddy/shared";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { MESSAGES, type Messages } from "./messages";

export type { Locale };

const LOCALE_KEY = "buddy-locale";

/** The language in use, also for code outside React (error texts). */
let current: Locale = "en";

function savedLocale(): string | null {
  try {
    return window.localStorage.getItem(LOCALE_KEY);
  } catch {
    return null;
  }
}

/** The saved choice, else the browser's languages, else English. */
export function initialLocale(): Locale {
  return pickLocale(savedLocale(), typeof navigator === "undefined" ? [] : navigator.languages ?? []);
}

interface I18n {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** This app's texts. */
  t: Messages;
  /** Wording shared with the phone app. */
  s: SharedText;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children, locale: fixed }: { children: ReactNode; locale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(() => fixed ?? initialLocale());

  const setLocale = useCallback((next: Locale) => {
    try {
      window.localStorage.setItem(LOCALE_KEY, next);
    } catch {
      // Not remembered; it still applies until the page is reloaded.
    }
    setLocaleState(next);
  }, []);

  useEffect(() => {
    current = locale;
    document.documentElement.lang = locale;
  }, [locale]);
  current = locale; // also during the first render, before effects run

  const value = useMemo(
    () => ({ locale, setLocale, t: MESSAGES[locale], s: SHARED_TEXT[locale] }),
    [locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n needs an I18nProvider");
  return value;
}

type ErrorCode = keyof Messages["errors"];

/** A failure whose text is already in the user's language (e.g. "no food with this barcode"). */
export class LocalizedError extends Error {}

/** Server codes that mean the same to the user as one of the translated codes. */
const SAME_AS: Record<string, ErrorCode> = { invalid_request: "validation_failed" };

/**
 * The text to show for a failure. English shows the server's own message. Other languages
 * translate by the problem's code and never show the English text.
 */
export function errorText(error: unknown, locale: Locale = current): string {
  const errors = MESSAGES[locale].errors;
  if (error instanceof LocalizedError) return error.message;
  if (locale === "en") return error instanceof Error ? error.message : errors.unknown;
  if (error instanceof ApiError) {
    const code = SAME_AS[error.code] ?? error.code;
    return Object.hasOwn(errors, code) && errors[code as ErrorCode] ? errors[code as ErrorCode] : errors.unknown;
  }
  if (error instanceof TypeError) return errors.network; // fetch failed: no server reached
  return errors.unknown;
}
