import { msg } from "@lingui/core/macro";
import type { Metadata } from "next";
import { getBrandTitle } from "@/utils/branding";
import { getLandingAlternates } from "@/utils/i18n/landing";
import type { Locale } from "@/utils/i18n/locales";
import { initLandingLingui } from "@/utils/i18n/server";

export function getPricingMetadata(locale: Locale): Metadata {
  const i18n = initLandingLingui(locale);
  return {
    title: getBrandTitle(i18n._(msg`Pricing`)),
    description: i18n._(
      msg`Simple, transparent pricing. No hidden fees. Cancel anytime.`,
    ),
    alternates: getLandingAlternates("/pricing", locale),
  };
}
