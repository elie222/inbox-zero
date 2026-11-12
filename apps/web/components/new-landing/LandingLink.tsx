"use client";

import { useLingui } from "@lingui/react";
import Link from "next/link";
import type { ComponentProps } from "react";
import { localizeLandingHref } from "@/utils/i18n/landing";
import { toLocale } from "@/utils/i18n/locales";

// A Link that stays in the page's language: on /es pages, a link to /pricing
// goes to /es/pricing when that page has a translation.
export function LandingLink({
  href,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const { i18n } = useLingui();
  return (
    <Link href={localizeLandingHref(href, toLocale(i18n.locale))} {...props} />
  );
}
