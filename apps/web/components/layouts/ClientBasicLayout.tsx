"use client";

import { messages } from "@/locales/en/landing.po";
import { BasicLayoutShell } from "@/components/layouts/BasicLayoutShell";
import { LinguiClientProvider } from "@/providers/LinguiClientProvider";
import { DEFAULT_LOCALE } from "@/utils/i18n/locales";

// For Client Component pages (errors, logout), which can't use the
// server-rendered BasicLayout. These pages are English only.
export function ClientBasicLayout({ children }: { children: React.ReactNode }) {
  return (
    <LinguiClientProvider locale={DEFAULT_LOCALE} messages={messages}>
      <BasicLayoutShell>{children}</BasicLayoutShell>
    </LinguiClientProvider>
  );
}
