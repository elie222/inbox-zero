"use client";

import {
  type CSSProperties,
  memo,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { toast } from "sonner";
import { MailAccountSwitcher } from "@/app/(app)/[emailAccountId]/mail/MailAccountSwitcher";
import {
  getMailCategories,
  getMailNavPath,
  type MailCategory,
  MailSidebar,
  type MailNavTarget,
} from "@/app/(app)/[emailAccountId]/mail/MailSidebar";
import type {
  MailboxItem,
  MailboxItemEdit,
} from "@/app/(app)/[emailAccountId]/mail/MailboxItemContextMenu";
import {
  MAIL_SIDEBAR_DEFAULT_WIDTH,
  MAIL_SIDEBAR_WIDTH_BOUNDS,
  MAIL_SIDEBAR_WIDTH_COOKIE,
} from "@/app/(app)/[emailAccountId]/mail/panel-widths";
import { PanelResizeHandle } from "@/components/PanelResizeHandle";
import { DesktopUpdateMenuItem } from "@/components/DesktopUpdateMenuItem";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Sidebar, useSidebar } from "@/components/ui/sidebar";
import { TEAM_HREF, useTeamNav } from "@/components/team-comments/use-team-nav";
import { useFolders } from "@/hooks/useFolders";
import { useLabelCounts } from "@/hooks/useLabelCounts";
import { useLabels } from "@/hooks/useLabels";
import { useSettingsDialog } from "@/hooks/useSettingsDialog";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useComposeModal } from "@/providers/ComposeModalProvider";
import type { EmailLabel } from "@/providers/email-label-types";
import type { OutlookFolder } from "@/utils/outlook/folders";
import { persistPanelWidth } from "@/utils/panel-width";
import {
  createLabelAction,
  deleteMailboxItemAction,
  updateMailboxItemAction,
} from "@/utils/actions/mail";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import { getActionErrorMessage } from "@/utils/error";
import { GMAIL_LABEL_COLORS } from "@/utils/gmail/label-colors";
import type { MailboxLabelCount } from "@/utils/mail-engine/label-count-targets";
import { OUTLOOK_CATEGORY_COLORS } from "@/utils/outlook/category-colors";
import { prefixPath } from "@/utils/path";
import { getEmailTerminology } from "@/utils/terminology";

const OUTLOOK_LABEL_COLOR_OPTIONS = OUTLOOK_CATEGORY_COLORS.map((option) => ({
  name: option.name,
  backgroundColor: option.value,
  textColor: "#000000",
}));
const NO_COUNTS = new Map<string, MailboxLabelCount>();
const NO_LABELS: EmailLabel[] = [];
const NO_FOLDERS: OutlookFolder[] = [];
const NO_CATEGORIES: MailCategory[] = [];

/**
 * The mail screen's left column. It owns the label counts and mailbox editing
 * so their updates stay here, and is memoized so thread navigation and list
 * snapshots don't re-render it.
 */
export const MailShellSidebar = memo(function MailShellSidebar({
  activeType,
  activeLabelId,
  activeFolderId,
  isAllAccounts,
  isDesktopApp,
  onSelectAccount,
  onSelectAllAccounts,
  onMailboxItemDeleted,
  onNavigate,
  isMobileNavOpen,
  onMobileNavOpenChange,
}: {
  activeType: string | null;
  activeLabelId: string | null;
  activeFolderId: string | null;
  isAllAccounts: boolean;
  isDesktopApp: boolean;
  onSelectAccount: (accountId: string) => void;
  onSelectAllAccounts: () => void;
  /** Leaves a view or split that the deleted label or folder defined. */
  onMailboxItemDeleted: (item: MailboxItem) => Promise<unknown>;
  onNavigate: () => void;
  isMobileNavOpen: boolean;
  onMobileNavOpenChange: (open: boolean) => void;
}) {
  const { emailAccountId, provider } = useAccount();
  const isGoogle = isGoogleProvider(provider);
  const isOutlook = isMicrosoftProvider(provider);
  const terminology = getEmailTerminology(provider);
  const { userLabels: allLabels, mutate: mutateLabels } = useLabels();
  const { folders, mutate: mutateFolders } = useFolders(provider);
  const { countsById, mutate: mutateCounts } = useLabelCounts({
    emailAccountId,
    labels: allLabels,
    folders,
  });
  const { hasTeam, unreadCount: teamUnreadCount } = useTeamNav();
  const { onOpen: openCompose } = useComposeModal();
  const { openSettings } = useSettingsDialog();
  const { state: openSidebars } = useSidebar();
  const isMailSidebarOpen = openSidebars.includes("left-sidebar");

  // Dragging writes straight to the CSS variable: re-rendering on every
  // pointer move would make the sidebar edge lag behind the cursor.
  const sidebarScopeRef = useRef<HTMLDivElement>(null);
  const setSidebarWidth = useCallback((width: number) => {
    sidebarScopeRef.current?.style.setProperty("--sidebar-width", `${width}px`);
  }, []);
  const resetSidebarWidth = useCallback(() => {
    setSidebarWidth(MAIL_SIDEBAR_DEFAULT_WIDTH);
    persistPanelWidth(MAIL_SIDEBAR_WIDTH_COOKIE, null);
  }, [setSidebarWidth]);

  const hrefFor = useCallback(
    (target: MailNavTarget) =>
      prefixPath(emailAccountId, getMailNavPath(target)),
    [emailAccountId],
  );

  const onCreateLabel = useCallback(
    async (name: string) => {
      const result = await createLabelAction(emailAccountId, { name });
      if (result?.serverError || result?.validationErrors) {
        toast.error(getActionErrorMessage(result));
        return;
      }
      // Without this the label the user just typed doesn't appear until an
      // unrelated revalidation happens to run.
      await mutateLabels();
      toast.success(
        `${terminology.label.singularCapitalized} "${name}" created`,
      );
    },
    [emailAccountId, mutateLabels, terminology.label.singularCapitalized],
  );

  const onEditMailboxItem = useCallback(
    async (edit: MailboxItemEdit) => {
      const result = await updateMailboxItemAction(emailAccountId, edit);

      if (result?.serverError || result?.validationErrors) {
        toast.error(getActionErrorMessage(result));
        return false;
      }

      await Promise.all([
        edit.kind === "folder" ? mutateFolders() : mutateLabels(),
        mutateCounts(),
      ]);
      toast.success(
        `${edit.kind === "folder" ? "Folder" : terminology.label.singularCapitalized} updated`,
      );
      return true;
    },
    [
      emailAccountId,
      mutateCounts,
      mutateFolders,
      mutateLabels,
      terminology.label.singularCapitalized,
    ],
  );

  const onDeleteMailboxItem = useCallback(
    async (item: MailboxItem) => {
      const result = await deleteMailboxItemAction(emailAccountId, {
        kind: item.kind,
        id: item.id,
      });
      if (result?.serverError || result?.validationErrors) {
        toast.error(getActionErrorMessage(result));
        return false;
      }

      await Promise.all([
        onMailboxItemDeleted(item),
        item.kind === "folder" ? mutateFolders() : mutateLabels(),
        mutateCounts(),
      ]);
      toast.success(
        `${item.kind === "folder" ? "Folder" : terminology.label.singularCapitalized} deleted`,
      );
      return true;
    },
    [
      emailAccountId,
      mutateCounts,
      mutateFolders,
      mutateLabels,
      onMailboxItemDeleted,
      terminology.label.singularCapitalized,
    ],
  );

  // The panel's overlay isn't covered by lg:hidden, so close the panel once
  // the window is wide enough for the rail.
  useEffect(() => {
    if (!isMobileNavOpen) return;
    const wide = window.matchMedia("(min-width: 1024px)");
    const closeWhenWide = () => {
      if (wide.matches) onMobileNavOpenChange(false);
    };
    closeWhenWide();
    wide.addEventListener("change", closeWhenWide);
    return () => wide.removeEventListener("change", closeWhenWide);
  }, [isMobileNavOpen, onMobileNavOpenChange]);

  const navigateFromSheet = () => {
    onNavigate();
    onMobileNavOpenChange(false);
  };
  const selectAccountFromSheet = (accountId: string) => {
    onMobileNavOpenChange(false);
    onSelectAccount(accountId);
  };
  const selectAllAccountsFromSheet = () => {
    onMobileNavOpenChange(false);
    onSelectAllAccounts();
  };
  const composeFromSheet = () => {
    onMobileNavOpenChange(false);
    openCompose();
  };
  const openSettingsFromSheet = () => {
    onMobileNavOpenChange(false);
    openSettings();
  };
  const renderMailSidebar = ({
    collapsed,
    inSheet,
  }: {
    collapsed: boolean;
    inSheet: boolean;
  }) => (
    <MailSidebar
      className="h-full w-full border-r-0"
      hideToggle={inSheet}
      collapsed={collapsed}
      activeType={activeType}
      activeLabelId={activeLabelId}
      activeFolderId={activeFolderId}
      hrefFor={hrefFor}
      onNavigate={inSheet ? navigateFromSheet : onNavigate}
      labels={isAllAccounts ? NO_LABELS : allLabels}
      folders={isAllAccounts || !isOutlook ? NO_FOLDERS : folders}
      countsById={isAllAccounts ? NO_COUNTS : countsById}
      categories={
        isAllAccounts
          ? NO_CATEGORIES
          : getMailCategories({ isGoogle, isOutlook })
      }
      categoryHeading={isOutlook ? "Inbox" : "Categories"}
      collapsibleCategories={!isOutlook}
      labelsHeading={terminology.label.pluralCapitalized}
      labelSingular={terminology.label.singular}
      emailAccountId={emailAccountId}
      onCompose={inSheet ? composeFromSheet : openCompose}
      onOpenSettings={inSheet ? openSettingsFromSheet : openSettings}
      onCreateLabel={onCreateLabel}
      onEditMailboxItem={onEditMailboxItem}
      onDeleteMailboxItem={onDeleteMailboxItem}
      labelEditMode={isOutlook ? "color" : "name-and-color"}
      supportsLabelVisibility={isGoogle}
      labelColorOptions={
        isOutlook ? OUTLOOK_LABEL_COLOR_OPTIONS : GMAIL_LABEL_COLORS
      }
      unified={isAllAccounts}
      team={
        hasTeam ? { href: TEAM_HREF, unreadCount: teamUnreadCount } : undefined
      }
      footer={
        <>
          <DesktopUpdateMenuItem />
          <MailAccountSwitcher
            isDesktopApp={isDesktopApp}
            isAllAccounts={isAllAccounts}
            onSelectAccount={inSheet ? selectAccountFromSheet : onSelectAccount}
            onSelectAll={
              inSheet ? selectAllAccountsFromSheet : onSelectAllAccounts
            }
            collapsed={collapsed}
          />
        </>
      }
    />
  );

  return (
    <>
      <div
        ref={sidebarScopeRef}
        className="hidden lg:contents"
        style={
          {
            "--sidebar-width": `var(--mail-sidebar-width, ${MAIL_SIDEBAR_DEFAULT_WIDTH}px)`,
          } as CSSProperties
        }
      >
        <Sidebar name="left-sidebar" collapsible="icon">
          {renderMailSidebar({ collapsed: !isMailSidebarOpen, inSheet: false })}
          {isMailSidebarOpen ? (
            <PanelResizeHandle
              label="Resize sidebar"
              edge="right"
              bounds={MAIL_SIDEBAR_WIDTH_BOUNDS}
              onResize={setSidebarWidth}
              onResizeEnd={persistSidebarWidth}
              onReset={resetSidebarWidth}
            />
          ) : null}
        </Sidebar>
      </div>
      {/* Below lg the rail is hidden, so phones and tablets reach the
        mailboxes and the app sections through this panel instead. */}
      <Sheet open={isMobileNavOpen} onOpenChange={onMobileNavOpenChange}>
        <SheetContent
          side="left"
          // Focusing the first control would pop the Compose tooltip over
          // the rows beneath it, so focus the panel itself.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement).focus();
          }}
          className="w-[--sidebar-width] p-0 lg:hidden [&>button]:hidden"
          style={
            {
              "--sidebar-width": `${MAIL_SIDEBAR_DEFAULT_WIDTH}px`,
            } as CSSProperties
          }
        >
          <SheetTitle className="sr-only">Mail navigation</SheetTitle>
          {renderMailSidebar({ collapsed: false, inSheet: true })}
        </SheetContent>
      </Sheet>
    </>
  );
});

function persistSidebarWidth(width: number) {
  persistPanelWidth(MAIL_SIDEBAR_WIDTH_COOKIE, width);
}
