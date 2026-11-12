import type { Messages } from "@lingui/core";
import { BasicLayoutShell } from "@/components/layouts/BasicLayoutShell";
import { LinguiClientProvider } from "@/providers/LinguiClientProvider";
import { DEFAULT_LOCALE, type Locale } from "@/utils/i18n/locales";
import { getLandingMessages, initLandingLingui } from "@/utils/i18n/server";

// Every server-rendered landing page renders through this layout, so it sets
// the page's language for both Server and Client Components. Pages pass their
// own catalog in `messages` when they have one (e.g. the marketing pages).
export function BasicLayout({
  children,
  locale = DEFAULT_LOCALE,
  messages,
}: {
  children: React.ReactNode;
  locale?: Locale;
  messages?: Messages;
}) {
  initLandingLingui(locale, messages);

  return (
    <LinguiClientProvider
      locale={locale}
      messages={getLandingMessages(locale, messages)}
    >
      {locale === DEFAULT_LOCALE ? null : (
        // The root layout is static and renders lang="en"; set the real
        // language before hydration so crawlers and screen readers get it.
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static locale code from LOCALES
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.lang=${JSON.stringify(locale)}`,
          }}
        />
      )}
      <BasicLayoutShell>{children}</BasicLayoutShell>
    </LinguiClientProvider>
  );
}
