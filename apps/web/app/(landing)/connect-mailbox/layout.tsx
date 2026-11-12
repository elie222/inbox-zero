import { LinguiClientProvider } from "@/providers/LinguiClientProvider";
import { getLocale, getMessages } from "@/utils/i18n/server";

// The page renders the app's translated add-account card.
export default async function ConnectMailboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();

  return (
    <LinguiClientProvider locale={locale} messages={getMessages(locale)}>
      {children}
    </LinguiClientProvider>
  );
}
