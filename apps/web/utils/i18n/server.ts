import "server-only";

import { type I18n, type Messages, setupI18n } from "@lingui/core";
import { setI18n } from "@lingui/react/server";
import { cookies } from "next/headers";
import { messages as en } from "@/locales/en/messages.po";
import { messages as es } from "@/locales/es/messages.po";
import { messages as fr } from "@/locales/fr/messages.po";
import { messages as de } from "@/locales/de/messages.po";
import { messages as ptBR } from "@/locales/pt-BR/messages.po";
import { LOCALE_COOKIE, type Locale, toLocale } from "@/utils/i18n/locales";

const catalogs: Record<Locale, Messages> = {
  en,
  es,
  fr,
  de,
  "pt-BR": ptBR,
};

// Catalogs are read-only, so one instance per locale is safe to share
// across requests.
const i18nInstances = Object.fromEntries(
  Object.entries(catalogs).map(([locale, messages]) => [
    locale,
    setupI18n({ locale, messages: { [locale]: messages } }),
  ]),
) as Record<Locale, I18n>;

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return toLocale(cookieStore.get(LOCALE_COOKIE)?.value);
}

export function getMessages(locale: Locale): Messages {
  return catalogs[locale];
}

/**
 * Activates the request's locale for Server Components. Server Components
 * have no React context, so call this at the top of every page, layout, or
 * `generateMetadata` that renders translated text.
 */
export async function initLingui(): Promise<I18n> {
  const i18n = i18nInstances[await getLocale()];
  setI18n(i18n);
  return i18n;
}
