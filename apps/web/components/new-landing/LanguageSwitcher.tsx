"use client";

import { useLingui } from "@lingui/react/macro";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  isLocalizedLandingPath,
  localizeLandingHref,
  parseLandingPathname,
} from "@/utils/i18n/landing";
import { DEFAULT_LOCALE, LOCALE_LABELS, LOCALES } from "@/utils/i18n/locales";
import { cn } from "@/utils";

// Links to the current page in every language. Hidden on pages that have no
// translations.
export function LanguageSwitcher({ className }: { className?: string }) {
  const { t, i18n } = useLingui();
  const pathname = usePathname();
  const { path } = parseLandingPathname(pathname);
  // Signed-in visitors see the home page at /home, because next.config sends
  // them from "/" to the app. English keeps them on /home.
  const translatedPath = path === "/home" ? "/" : path;
  if (!isLocalizedLandingPath(translatedPath)) return null;

  return (
    <nav
      aria-label={t`Language`}
      className={cn("flex flex-wrap gap-x-4 gap-y-1", className)}
    >
      {LOCALES.map((locale) => (
        <Link
          key={locale}
          href={localizeLandingHref(
            locale === DEFAULT_LOCALE ? path : translatedPath,
            locale,
          )}
          hrefLang={locale}
          lang={locale}
          prefetch={false}
          aria-current={locale === i18n.locale ? "page" : undefined}
          className={cn(
            "text-sm leading-6 text-gray-500 hover:text-gray-900",
            locale === i18n.locale && "font-medium text-gray-900",
          )}
        >
          {LOCALE_LABELS[locale]}
        </Link>
      ))}
    </nav>
  );
}
