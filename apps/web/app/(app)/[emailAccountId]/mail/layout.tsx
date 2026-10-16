import type { CSSProperties } from "react";
import { cookies } from "next/headers";
import { MailThemeScope } from "@/app/(app)/[emailAccountId]/mail/MailThemeScope";
import {
  MAIL_LIST_WIDTH,
  MAIL_SIDEBAR_WIDTH,
} from "@/app/(app)/[emailAccountId]/mail/panel-widths";
import { ShortcutsProvider } from "@/lib/shortcuts/ShortcutsProvider";
import { MAIL_SHORTCUT_SCOPES } from "@/lib/shortcuts/registry";
import { parsePanelWidthCookie } from "@/utils/panel-width";

export default async function MailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sidebarWidth = parsePanelWidthCookie(
    MAIL_SIDEBAR_WIDTH,
    cookieStore.get(MAIL_SIDEBAR_WIDTH.cookie)?.value,
  );
  const listWidth = parsePanelWidthCookie(
    MAIL_LIST_WIDTH,
    cookieStore.get(MAIL_LIST_WIDTH.cookie)?.value,
  );

  // CommandK's provider only wraps its own palette, so the mail screen needs its
  // own for react-hotkeys-hook to have any active scope to bind against.
  return (
    <ShortcutsProvider scopes={MAIL_SHORTCUT_SCOPES}>
      <MailThemeScope />
      {/* `contents` so the variables inherit without joining the flex layout. */}
      <div
        className="contents"
        style={
          {
            "--mail-sidebar-width": `${sidebarWidth}px`,
            [MAIL_LIST_WIDTH.cssVar]: `${listWidth}px`,
          } as CSSProperties
        }
      >
        {children}
      </div>
    </ShortcutsProvider>
  );
}
