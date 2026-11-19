"use client";

import {
  type CSSProperties,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { toast } from "sonner";
import type { KeyedMutator } from "swr";
import { MailAccountSwitcher } from "@/app/(app)/[emailAccountId]/mail/MailAccountSwitcher";
import { SidebarCards } from "@/components/sidebar-cards/SidebarCards";
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
import { randomUuid } from "@/utils/uuid";

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
  /**
   * Leaves a view or split that the deleted label or folder defined.
   * `deleted` resolves to whether the provider confirmed the delete.
   */
  onMailboxItemDeleted: (
    item: MailboxItem,
    deleted: Promise<boolean>,
  ) => Promise<unknown>;
  onNavigate: () => void;
  isMobileNavOpen: boolean;
  onMobileNavOpenChange: (open: boolean) => void;
}) {
  const { emailAccountId, provider } = useAccount();
  const isGoogle = isGoogleProvider(provider);
  const isOutlook = isMicrosoftProvider(provider);
  const { t } = useLingui();
  const failureMessage = t`Something went wrong. Try again.`;
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

  // Label and folder lists come from the provider rather than the mailbox, so
  // these skip the mail engine. Each change shows at once and stays until the
  // list reloads from the provider; a refused change rolls back with an error.
  // A label shows under a placeholder id until the provider creates it; an
  // edit or delete made meanwhile waits for the real id, and the sidebar keeps
  // keying the row by its placeholder so it isn't remounted.
  const creatingLabels = useRef(new Map<string, Promise<string>>());
  const [labelKeys, setLabelKeys] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const resolveLabelId = useCallback(
    async (id: string) => (await creatingLabels.current.get(id)) ?? id,
    [],
  );

  const onCreateLabel = useCallback(
    (name: string) => {
      const placeholderId = `pending:${randomUuid()}`;
      const created = createLabelAction(emailAccountId, { name }).then(
        (result) => {
          if (!result?.data?.id)
            throw new Error(getActionErrorMessage(result ?? {}));
          return result.data.id;
        },
      );
      creatingLabels.current.set(placeholderId, created);
      mutateLabels(
        async (current) => {
          const id = await created;
          setLabelKeys((keys) => new Map(keys).set(id, placeholderId));
          return {
            labels: [
              ...(current?.labels ?? []).filter(
                (label) => label.id !== placeholderId,
              ),
              { id, name, type: "user" },
            ],
          };
        },
        {
          optimisticData: (committed, displayed) => ({
            labels: [
              ...((displayed ?? committed)?.labels ?? []),
              { id: placeholderId, name, type: "user" },
            ],
          }),
          rollbackOnError: true,
        },
      )
        .catch((error: unknown) =>
          toastMailboxItemFailure(error, failureMessage),
        )
        .finally(() => {
          creatingLabels.current.delete(placeholderId);
          // A sidebar change made meanwhile supersedes this result in SWR, so
          // reload to be sure the new label is listed.
          mutateLabels().catch(() => {});
        });
    },
    [emailAccountId, failureMessage, mutateLabels],
  );

  const onEditMailboxItem = useCallback(
    async (edit: MailboxItemEdit) => {
      const request = async () =>
        runMailboxItemAction(async () =>
          updateMailboxItemAction(emailAccountId, {
            ...edit,
            id: await resolveLabelId(edit.id),
          }),
        );
      if (edit.kind === "folder") {
        updateOptimistically(
          mutateFolders,
          request,
          (folders) =>
            mapFolders(folders ?? [], (folder) =>
              folder.id === edit.id
                ? { ...folder, displayName: edit.name }
                : folder,
            ),
          failureMessage,
        );
      } else {
        updateOptimistically(
          mutateLabels,
          request,
          (current) => ({
            labels: (current?.labels ?? []).map((label) =>
              label.id === edit.id ? { ...label, ...edit } : label,
            ),
          }),
          failureMessage,
        );
      }
      return true;
    },
    [
      emailAccountId,
      failureMessage,
      mutateFolders,
      mutateLabels,
      resolveLabelId,
    ],
  );

  const onDeleteMailboxItem = useCallback(
    async (item: MailboxItem) => {
      const request = async () => {
        await runMailboxItemAction(async () =>
          deleteMailboxItemAction(emailAccountId, {
            kind: item.kind,
            id: await resolveLabelId(item.id),
          }),
        );
        // Deleting takes the label off its messages on the provider's side.
        mutateCounts().catch(() => {});
      };
      const deleted =
        item.kind === "folder"
          ? updateOptimistically(
              mutateFolders,
              request,
              (folders) => withoutFolder(folders ?? [], item.id),
              failureMessage,
            )
          : updateOptimistically(
              mutateLabels,
              request,
              (current) => ({
                labels: (current?.labels ?? []).filter(
                  (label) => label.id !== item.id,
                ),
              }),
              failureMessage,
            );
      await onMailboxItemDeleted(item, deleted);
      return true;
    },
    [
      emailAccountId,
      failureMessage,
      mutateCounts,
      mutateFolders,
      mutateLabels,
      onMailboxItemDeleted,
      resolveLabelId,
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
      categoryHeading={isOutlook ? t`Inbox` : t`Categories`}
      collapsibleCategories={!isOutlook}
      labelsHeading={isOutlook ? t`Categories` : t`Labels`}
      labelSingular={isOutlook ? t`category` : t`label`}
      emailAccountId={emailAccountId}
      onCompose={inSheet ? composeFromSheet : openCompose}
      onOpenSettings={inSheet ? openSettingsFromSheet : openSettings}
      onCreateLabel={onCreateLabel}
      labelKeys={labelKeys}
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
          {!isAllAccounts && (
            <SidebarCards
              className="pt-2"
              collapsed={collapsed}
              includePremium={false}
            />
          )}
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
              label={t`Resize sidebar`}
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
          <SheetTitle className="sr-only">
            <Trans>Mail navigation</Trans>
          </SheetTitle>
          {renderMailSidebar({ collapsed: false, inSheet: true })}
        </SheetContent>
      </Sheet>
    </>
  );
});

function persistSidebarWidth(width: number) {
  persistPanelWidth(MAIL_SIDEBAR_WIDTH_COOKIE, width);
}

async function runMailboxItemAction(
  request: () => Promise<
    Parameters<typeof getActionErrorMessage>[0] | undefined
  >,
) {
  const result = await request();
  if (result?.serverError || result?.validationErrors)
    throw new Error(getActionErrorMessage(result));
}

/**
 * Shows `apply` at once, runs `request`, then reloads the list; a refused
 * request rolls back and shows why. Resolves to whether it succeeded.
 */
function updateOptimistically<T>(
  mutate: KeyedMutator<T>,
  request: () => Promise<void>,
  apply: (current: T | undefined) => T,
  failureMessage: string,
) {
  return mutate(
    async (current) => {
      await request();
      return current;
    },
    {
      // The list on screen may hold other pending changes, such as a label
      // still being created; build on it rather than on the last saved list.
      optimisticData: (committed, displayed) => apply(displayed ?? committed),
      populateCache: false,
      rollbackOnError: true,
    },
  ).then(
    () => true,
    (error: unknown) => {
      toastMailboxItemFailure(error, failureMessage);
      return false;
    },
  );
}

function toastMailboxItemFailure(error: unknown, failureMessage: string) {
  toast.error(error instanceof Error ? error.message : failureMessage);
}

function mapFolders(
  folders: OutlookFolder[],
  update: (folder: OutlookFolder) => OutlookFolder,
): OutlookFolder[] {
  return folders.map((folder) =>
    update({
      ...folder,
      childFolders: mapFolders(folder.childFolders, update),
    }),
  );
}

function withoutFolder(
  folders: OutlookFolder[],
  folderId: string,
): OutlookFolder[] {
  return folders
    .filter((folder) => folder.id !== folderId)
    .map((folder) => ({
      ...folder,
      childFolders: withoutFolder(folder.childFolders, folderId),
    }));
}
