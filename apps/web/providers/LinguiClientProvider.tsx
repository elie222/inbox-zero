"use client";

import { type Messages, setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { type ReactNode, useEffect, useMemo } from "react";
import type { Locale } from "@/utils/i18n/locales";

export function LinguiClientProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: ReactNode;
}) {
  // Rebuilt when the locale changes: switching languages refreshes the server
  // layout, which passes the new locale's catalog down.
  const i18n = useMemo(
    () => setupI18n({ locale, messages: { [locale]: messages } }),
    [locale, messages],
  );

  // The root layout is static and always renders lang="en".
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}
