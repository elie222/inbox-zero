import { msg } from "@lingui/core/macro";
import type { Metadata } from "next";
import { BRAND_NAME } from "@/utils/branding";
import { getLandingAlternates } from "@/utils/i18n/landing";
import type { Locale } from "@/utils/i18n/locales";
import { initLandingLingui } from "@/utils/i18n/server";

// The root layout's title and description are English; translated home pages
// override them so search results show the page's language.
export function getHomeMetadata(locale: Locale): Metadata {
  const alternates = getLandingAlternates("/", locale);
  if (locale === "en") return { alternates };

  const i18n = initLandingLingui(locale);
  const title = i18n._(msg`${BRAND_NAME} | Automate and clean your inbox`);
  const description = i18n._(
    msg`Your AI executive assistant to reach inbox zero fast. Automate emails, bulk unsubscribe, block cold emails, and analytics. Open-source`,
  );
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { title, description },
    alternates,
  };
}
