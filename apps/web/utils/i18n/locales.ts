export const LOCALES = [
  "en",
  "es",
  "fr",
  "de",
  "pt-BR",
  "it",
  "nl",
  "pl",
  "tr",
  "ja",
  "ko",
  "zh-CN",
] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "locale";

// Each language named in itself, so people can find their own in the picker.
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  "pt-BR": "Português (Brasil)",
  it: "Italiano",
  nl: "Nederlands",
  pl: "Polski",
  tr: "Türkçe",
  ja: "日本語",
  ko: "한국어",
  "zh-CN": "简体中文",
};

export function toLocale(value: string | null | undefined): Locale {
  return LOCALES.find((locale) => locale === value) ?? DEFAULT_LOCALE;
}
