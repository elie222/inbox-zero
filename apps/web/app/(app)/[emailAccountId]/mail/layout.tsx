import { MailThemeScope } from "@/app/(app)/[emailAccountId]/mail/MailThemeScope";
import { ShortcutsProvider } from "@/lib/shortcuts/ShortcutsProvider";
import { MAIL_SHORTCUT_SCOPES } from "@/lib/shortcuts/registry";

export default function MailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // CommandK's provider only wraps its own palette, so the mail screen needs its
  // own for react-hotkeys-hook to have any active scope to bind against.
  return (
    <ShortcutsProvider scopes={MAIL_SHORTCUT_SCOPES}>
      <MailThemeScope />
      {children}
    </ShortcutsProvider>
  );
}
