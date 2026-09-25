"use client";

import { type CSSProperties, memo, useCallback, useRef } from "react";
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
import { MailSidebarResizeHandle } from "@/app/(app)/[emailAccountId]/mail/MailSidebarResizeHandle";
import {
  MAIL_SIDEBAR_DEFAULT_WIDTH,
  MAIL_SIDEBAR_RAIL_WIDTH,
} from "@/app/(app)/[emailAccountId]/mail/sidebar-width";
import { Sidebar, useSidebar } from "@/components/ui/sidebar";
import { useFolders } from "@/hooks/useFolders";
import { useLabelCounts } from "@/hooks/useLabelCounts";
import { useLabels } from "@/hooks/useLabels";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useComposeModal } from "@/providers/ComposeModalProvider";
import type { EmailLabel } from "@/providers/email-label-types";
import type { OutlookFolder } from "@/utils/outlook/folders";
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
  const { onOpen: openCompose } = useComposeModal();
  const { state: openSidebars } = useSidebar();
  const isMailSidebarOpen = openSidebars.includes("left-sidebar");

  // Dragging writes straight to the CSS variable: re-rendering on every
  // pointer move would make the sidebar edge lag behind the cursor.
  const sidebarScopeRef = useRef<HTMLDivElement>(null);
  const setSidebarWidth = useCallback((width: number) => {
    sidebarScopeRef.current?.style.setProperty("--sidebar-width", `${width}px`);
  }, []);

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

  return (
    <div
      ref={sidebarScopeRef}
      className="hidden lg:contents"
      style={
        {
          "--sidebar-width": `var(--mail-sidebar-width, ${MAIL_SIDEBAR_DEFAULT_WIDTH}px)`,
          "--sidebar-width-icon": `${MAIL_SIDEBAR_RAIL_WIDTH}px`,
        } as CSSProperties
      }
    >
      <Sidebar name="left-sidebar" collapsible="icon">
        <MailSidebar
          className="h-full w-full border-r-0"
          collapsed={!isMailSidebarOpen}
          activeType={activeType}
          activeLabelId={activeLabelId}
          activeFolderId={activeFolderId}
          hrefFor={hrefFor}
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
          backToAppHref={prefixPath(emailAccountId, "/automation")}
          onCompose={openCompose}
          onCreateLabel={onCreateLabel}
          onEditMailboxItem={onEditMailboxItem}
          onDeleteMailboxItem={onDeleteMailboxItem}
          labelEditMode={isOutlook ? "color" : "name-and-color"}
          supportsLabelVisibility={isGoogle}
          labelColorOptions={
            isOutlook ? OUTLOOK_LABEL_COLOR_OPTIONS : GMAIL_LABEL_COLORS
          }
          unified={isAllAccounts}
          footer={
            <MailAccountSwitcher
              isDesktopApp={isDesktopApp}
              isAllAccounts={isAllAccounts}
              onSelectAccount={onSelectAccount}
              onSelectAll={onSelectAllAccounts}
              variant="sidebar"
              collapsed={!isMailSidebarOpen}
            />
          }
        />
        {isMailSidebarOpen ? (
          <MailSidebarResizeHandle onResize={setSidebarWidth} />
        ) : null}
      </Sidebar>
    </div>
  );
});
