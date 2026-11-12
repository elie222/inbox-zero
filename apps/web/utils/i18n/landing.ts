import type { Metadata } from "next";
// Relative on purpose: next.config.ts imports this file, and the "@/" alias
// isn't available while Next loads its config.
import { DEFAULT_LOCALE, type Locale, LOCALES } from "./locales";

// Translated landing pages live at /<locale>/<path> (e.g. /es/pricing).
// English keeps the unprefixed URL. next.config rewrites the prefixed URLs to
// the internal `/l/[locale]` route tree.
export const LANDING_LOCALES = LOCALES.filter(
  (locale) => locale !== DEFAULT_LOCALE,
);

type LandingLocale = (typeof LANDING_LOCALES)[number];

// Landing pages that have a translated version. Links on a translated page
// only point to the same language when the target is listed here, so a page
// without a translation is never linked to a missing URL.
// The marketing submodule translated pages are listed here too: their URLs
// are public, and self-hosted builds without the submodule never link to them.
const LOCALIZED_LANDING_PATHS = new Set<string>([
  "/",
  "/pricing",
  "/about",
  "/accounting-firms",
  "/ai-assistant-chat",
  "/ai-automation",
  "/ai-email-assistant",
  "/ai-email-assistant-for-outlook",
  "/ai-meeting-notetaker",
  "/auto-file-email-attachments",
  "/auto-forward-emails",
  "/block-cold-emails",
  "/brief-my-meeting",
  "/bulk-email-unsubscriber",
  "/clean-inbox",
  "/cli",
  "/client-intake-email-automation",
  "/commercial-real-estate",
  "/construction",
  "/creator",
  "/customer-support",
  "/download",
  "/ecommerce",
  "/email-analytics",
  "/email-client",
  "/email-follow-up-tracker",
  "/enterprise",
  "/executive-assistants",
  "/founders",
  "/gmail-mcp",
  "/insurance-agencies",
  "/law-firms",
  "/meeting-briefs-for-client-teams",
  "/mobile-app",
  "/msp",
  "/openclaw",
  "/operations-managers",
  "/organize-document-heavy-email",
  "/outlook-mcp",
  "/property-management",
  "/real-estate",
  "/recruiting",
  "/reply-zero-ai",
  "/sales",
  "/slack-integration",
  "/small-business",
  "/support",
  "/teams-integration",
  "/telegram-integration",
  "/travel-advisors",
]);

export function isLocalizedLandingPath(path: string) {
  return LOCALIZED_LANDING_PATHS.has(path);
}

export function getLocalizedLandingPaths(): string[] {
  return [...LOCALIZED_LANDING_PATHS];
}

export function isLandingLocale(value: string): value is LandingLocale {
  return (LANDING_LOCALES as readonly string[]).includes(value);
}

/**
 * The URL of a landing path in a language. Leaves the href alone for English,
 * for external links, anchors, and pages that have no translation.
 */
export function localizeLandingHref(href: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE || !href.startsWith("/")) return href;
  const [pathAndQuery, hash] = href.split("#", 2);
  const [path, query] = pathAndQuery.split("?", 2);
  if (!isLocalizedLandingPath(path || "/")) return href;
  const localizedPath = path === "/" ? `/${locale}` : `/${locale}${path}`;
  return `${localizedPath}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}

// Accepts the internal `/l/es/pricing` form too: during static rendering the
// server sees the rewritten path while the browser sees `/es/pricing`, and
// both must give the same result to hydrate cleanly.
export function parseLandingPathname(pathname: string): {
  locale: Locale;
  path: string;
} {
  const publicPathname = pathname.replace(/^\/l(?=\/)/, "");
  const [, first, ...rest] = publicPathname.split("/");
  if (first && isLandingLocale(first)) {
    return { locale: first, path: `/${rest.join("/")}` };
  }
  return { locale: DEFAULT_LOCALE, path: publicPathname || "/" };
}

/** Canonical and hreflang alternates for a landing path in a language. */
export function getLandingAlternates(
  path: string,
  locale: Locale,
): NonNullable<Metadata["alternates"]> {
  if (!isLocalizedLandingPath(path)) return { canonical: path };
  const languages: Record<string, string> = { "x-default": path };
  for (const language of LOCALES) {
    languages[language] = localizeLandingHref(path, language);
  }
  return { canonical: localizeLandingHref(path, locale), languages };
}

/** Static params for the internal `/l/[locale]` route tree. */
export function generateLandingStaticParams() {
  return LANDING_LOCALES.map((locale) => ({ locale }));
}
