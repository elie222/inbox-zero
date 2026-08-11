import { MailThemeScope } from "@/app/(app)/[emailAccountId]/mail/MailThemeScope";
import { ShortcutsProvider } from "@/lib/shortcuts/ShortcutsProvider";
import type { ShortcutScope } from "@/lib/shortcuts/registry";

// CommandK's provider only wraps its own palette, so the mail screen needs its
// own for react-hotkeys-hook to have any active scope to bind against.
const SCOPES: readonly ShortcutScope[] = ["global", "mail"];

export default function MailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ShortcutsProvider scopes={SCOPES}>
      <MailThemeScope />
      {children}
    </ShortcutsProvider>
  );
}
