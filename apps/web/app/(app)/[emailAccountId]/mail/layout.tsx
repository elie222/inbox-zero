import type { CSSProperties } from "react";
import { cookies } from "next/headers";
import { DeploymentUpdateNotice } from "@/app/(app)/[emailAccountId]/mail/DeploymentUpdateNotice";
import { MailThemeScope } from "@/app/(app)/[emailAccountId]/mail/MailThemeScope";
import {
  MAIL_LIST_WIDTH_BOUNDS,
  MAIL_LIST_WIDTH_COOKIE,
  MAIL_SIDEBAR_DEFAULT_WIDTH,
  MAIL_SIDEBAR_WIDTH_BOUNDS,
  MAIL_SIDEBAR_WIDTH_COOKIE,
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
  const sidebarWidth =
    parsePanelWidthCookie(
      cookieStore.get(MAIL_SIDEBAR_WIDTH_COOKIE)?.value,
      MAIL_SIDEBAR_WIDTH_BOUNDS,
    ) ?? MAIL_SIDEBAR_DEFAULT_WIDTH;
  const listWidth = parsePanelWidthCookie(
    cookieStore.get(MAIL_LIST_WIDTH_COOKIE)?.value,
    MAIL_LIST_WIDTH_BOUNDS,
  );

  // CommandK's provider only wraps its own palette, so the mail screen needs its
  // own for react-hotkeys-hook to have any active scope to bind against.
  return (
    <ShortcutsProvider scopes={MAIL_SHORTCUT_SCOPES}>
      <MailThemeScope />
      <DeploymentUpdateNotice />
      {/* `contents` so the variables inherit without joining the flex layout. */}
      <div
        className="contents"
        style={
          {
            "--mail-sidebar-width": `${sidebarWidth}px`,
            ...(listWidth === null
              ? {}
              : { "--mail-list-width": `${listWidth}px` }),
          } as CSSProperties
        }
      >
        {children}
      </div>
    </ShortcutsProvider>
  );
}
