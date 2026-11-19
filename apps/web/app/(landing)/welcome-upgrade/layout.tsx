import { LinguiClientProvider } from "@/providers/LinguiClientProvider";
import { getLocale, getMessages } from "@/utils/i18n/server";

// The upgrade page renders the app's pricing components, which are translated.
export default async function WelcomeUpgradeLayout({
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
