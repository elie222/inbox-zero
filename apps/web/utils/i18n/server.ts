import "server-only";

import { type I18n, type Messages, setupI18n } from "@lingui/core";
import { setI18n } from "@lingui/react/server";
import { cookies } from "next/headers";
import { messages as en } from "@/locales/en/messages.po";
import { messages as es } from "@/locales/es/messages.po";
import { messages as fr } from "@/locales/fr/messages.po";
import { messages as de } from "@/locales/de/messages.po";
import { messages as ptBR } from "@/locales/pt-BR/messages.po";
import { messages as it } from "@/locales/it/messages.po";
import { messages as nl } from "@/locales/nl/messages.po";
import { messages as pl } from "@/locales/pl/messages.po";
import { messages as tr } from "@/locales/tr/messages.po";
import { messages as ja } from "@/locales/ja/messages.po";
import { messages as ko } from "@/locales/ko/messages.po";
import { messages as zhCN } from "@/locales/zh-CN/messages.po";
import { messages as enLanding } from "@/locales/en/landing.po";
import { messages as esLanding } from "@/locales/es/landing.po";
import { messages as frLanding } from "@/locales/fr/landing.po";
import { messages as deLanding } from "@/locales/de/landing.po";
import { messages as ptBRLanding } from "@/locales/pt-BR/landing.po";
import { messages as itLanding } from "@/locales/it/landing.po";
import { messages as nlLanding } from "@/locales/nl/landing.po";
import { messages as plLanding } from "@/locales/pl/landing.po";
import { messages as trLanding } from "@/locales/tr/landing.po";
import { messages as jaLanding } from "@/locales/ja/landing.po";
import { messages as koLanding } from "@/locales/ko/landing.po";
import { messages as zhCNLanding } from "@/locales/zh-CN/landing.po";
import { LOCALE_COOKIE, type Locale, toLocale } from "@/utils/i18n/locales";

const landingCatalogs: Record<Locale, Messages> = {
  en: enLanding,
  es: esLanding,
  fr: frLanding,
  de: deLanding,
  "pt-BR": ptBRLanding,
  it: itLanding,
  nl: nlLanding,
  pl: plLanding,
  tr: trLanding,
  ja: jaLanding,
  ko: koLanding,
  "zh-CN": zhCNLanding,
};

// A few app screens render landing components (e.g. the upgrade page's
// footer), so the app catalog includes the small landing one.
const catalogs: Record<Locale, Messages> = {
  en: { ...enLanding, ...en },
  es: { ...esLanding, ...es },
  fr: { ...frLanding, ...fr },
  de: { ...deLanding, ...de },
  "pt-BR": { ...ptBRLanding, ...ptBR },
  it: { ...itLanding, ...it },
  nl: { ...nlLanding, ...nl },
  pl: { ...plLanding, ...pl },
  tr: { ...trLanding, ...tr },
  ja: { ...jaLanding, ...ja },
  ko: { ...koLanding, ...ko },
  "zh-CN": { ...zhCNLanding, ...zhCN },
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

export function getLandingMessages(
  locale: Locale,
  extraMessages?: Messages,
): Messages {
  if (!extraMessages) return landingCatalogs[locale];
  const cached = mergedLandingMessages.get(extraMessages)?.get(locale);
  if (cached) return cached;
  const merged = { ...landingCatalogs[locale], ...extraMessages };
  const byLocale = mergedLandingMessages.get(extraMessages) ?? new Map();
  byLocale.set(locale, merged);
  mergedLandingMessages.set(extraMessages, byLocale);
  return merged;
}

/**
 * Activates a landing page's locale for Server Components. Landing pages take
 * their locale from the URL, not the cookie, so they stay statically rendered.
 * `extraMessages` lets a page add its own catalog (e.g. the marketing pages').
 */
export function initLandingLingui(
  locale: Locale,
  extraMessages?: Messages,
): I18n {
  const key = extraMessages ?? landingCatalogs;
  const byLocale = landingI18nInstances.get(key) ?? new Map<Locale, I18n>();
  let i18n = byLocale.get(locale);
  if (!i18n) {
    i18n = setupI18n({
      locale,
      messages: { [locale]: getLandingMessages(locale, extraMessages) },
    });
    byLocale.set(locale, i18n);
    landingI18nInstances.set(key, byLocale);
  }
  setI18n(i18n);
  return i18n;
}

const mergedLandingMessages = new WeakMap<Messages, Map<Locale, Messages>>();
const landingI18nInstances = new WeakMap<object, Map<Locale, I18n>>();
