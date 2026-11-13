"use client";

import { useLingui } from "@lingui/react/macro";
import { CheckIcon, ChevronDownIcon, GlobeIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  isLocalizedLandingPath,
  localizeLandingHref,
  parseLandingPathname,
} from "@/utils/i18n/landing";
import {
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  LOCALES,
  toLocale,
} from "@/utils/i18n/locales";
import { cn } from "@/utils";

// Links to the current page in every language. Hidden on pages that have no
// translations.
export function LanguageSwitcher({ className }: { className?: string }) {
  const { t, i18n } = useLingui();
  const pathname = usePathname();
  const { path } = parseLandingPathname(pathname);
  // The English home page links to /home: next.config sends signed-in
  // visitors from "/" to the app, and /home shows them the same page.
  const translatedPath = path === "/home" ? "/" : path;
  if (!isLocalizedLandingPath(translatedPath)) return null;
  const englishHomeHref = i18n.locale === DEFAULT_LOCALE ? path : "/home";
  const currentLocale = toLocale(i18n.locale);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={`${t`Language`} (${LOCALE_LABELS[currentLocale]})`}
        className={cn(
          "flex items-center gap-1.5 rounded-md text-sm leading-6 text-gray-500 outline-none hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-gray-300 data-[state=open]:text-gray-900",
          className,
        )}
      >
        <GlobeIcon className="size-4" aria-hidden="true" />
        <span lang={currentLocale}>{LOCALE_LABELS[currentLocale]}</span>
        <ChevronDownIcon className="size-3.5" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        className="min-w-48 border-gray-200 bg-white text-gray-900"
      >
        {LOCALES.map((locale) => {
          const isCurrent = locale === currentLocale;
          return (
            <DropdownMenuItem
              key={locale}
              asChild
              className="cursor-pointer justify-between text-gray-600 focus:bg-gray-100 focus:text-gray-900"
            >
              <Link
                href={
                  locale === DEFAULT_LOCALE && translatedPath === "/"
                    ? englishHomeHref
                    : localizeLandingHref(translatedPath, locale)
                }
                hrefLang={locale}
                lang={locale}
                prefetch={false}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(isCurrent && "font-medium text-gray-900")}
              >
                {LOCALE_LABELS[locale]}
                {isCurrent ? (
                  <CheckIcon className="text-gray-900" aria-hidden="true" />
                ) : null}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
