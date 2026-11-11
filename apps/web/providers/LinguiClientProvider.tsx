"use client";

import { type Messages, setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { type ReactNode, useEffect, useMemo } from "react";
import { DEFAULT_LOCALE, type Locale } from "@/utils/i18n/locales";

export function LinguiClientProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: ReactNode;
}) {
  // Rebuilt only when the locale changes. Every server re-render of the layout
  // (refreshes, revalidated actions) sends a new copy of the same catalog, and a
  // new instance would change `t` and re-run every effect that depends on it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a locale's catalog never changes at runtime
  const i18n = useMemo(
    () => setupI18n({ locale, messages: { [locale]: messages } }),
    [locale],
  );

  // The root layout is static and always renders lang="en". Restore it on
  // unmount so pages outside the app aren't left marked as another language.
  useEffect(() => {
    document.documentElement.lang = locale;
    return () => {
      document.documentElement.lang = DEFAULT_LOCALE;
    };
  }, [locale]);

  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}
