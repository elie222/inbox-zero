import { LinguiClientProvider } from "@/providers/LinguiClientProvider";
import { DEFAULT_LOCALE } from "@/utils/i18n/locales";
import { getMessages } from "@/utils/i18n/server";

export const dynamic = "force-dynamic";

// The gallery renders translated app components outside the (app) layout.
export default function ComponentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LinguiClientProvider
      locale={DEFAULT_LOCALE}
      messages={getMessages(DEFAULT_LOCALE)}
    >
      {children}
    </LinguiClientProvider>
  );
}
