import type { Messages } from "@lingui/core";
import { Header } from "@/components/new-landing/sections/Header";
import { Footer } from "@/components/new-landing/sections/Footer";
import { LinguiClientProvider } from "@/providers/LinguiClientProvider";
import { DEFAULT_LOCALE, type Locale } from "@/utils/i18n/locales";
import { getLandingMessages, initLandingLingui } from "@/utils/i18n/server";

export function BlogHeader() {
  return (
    <div className="sticky inset-x-0 top-0 z-30 w-full transition-all">
      <div className="bg-white shadow">
        <Header className="mx-auto w-full max-w-screen-xl px-6 lg:px-8" />
      </div>
    </div>
  );
}

// Like BasicLayout, sets the page's language for Server and Client Components.
export function BlogLayout({
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
      <div className="bg-slate-50">
        <BlogHeader />
        <main className="isolate">{children}</main>
        <div className="mt-20">
          <Footer
            variant="simple"
            className="mx-auto w-full max-w-screen-xl px-6 lg:px-8"
          />
        </div>
      </div>
    </LinguiClientProvider>
  );
}
