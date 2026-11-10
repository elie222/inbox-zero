export const LOCALES = ["en", "es"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "locale";

// Each language named in itself, so people can find their own in the picker.
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
};

export function toLocale(value: string | null | undefined): Locale {
  return LOCALES.find((locale) => locale === value) ?? DEFAULT_LOCALE;
}
