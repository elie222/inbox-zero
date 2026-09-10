import type { CSSProperties } from "react";
import { cookies } from "next/headers";
import { MailThemeScope } from "@/app/(app)/[emailAccountId]/mail/MailThemeScope";
import {
  clampMailSidebarWidth,
  MAIL_SIDEBAR_WIDTH_COOKIE,
} from "@/app/(app)/[emailAccountId]/mail/sidebar-width";
import { ShortcutsProvider } from "@/lib/shortcuts/ShortcutsProvider";
import { MAIL_SHORTCUT_SCOPES } from "@/lib/shortcuts/registry";

export default async function MailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sidebarWidth = clampMailSidebarWidth(
    Number.parseInt(
      cookieStore.get(MAIL_SIDEBAR_WIDTH_COOKIE)?.value ?? "",
      10,
    ),
  );

  // CommandK's provider only wraps its own palette, so the mail screen needs its
  // own for react-hotkeys-hook to have any active scope to bind against.
  return (
    <ShortcutsProvider scopes={MAIL_SHORTCUT_SCOPES}>
      <MailThemeScope />
      {/* `contents` so the variable inherits without joining the flex layout. */}
      <div
        className="contents"
        style={{ "--mail-sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      >
        {children}
      </div>
    </ShortcutsProvider>
  );
}
