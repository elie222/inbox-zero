"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueryState } from "nuqs";
import { toast } from "sonner";
import { ListToolbar } from "@/app/(app)/[emailAccountId]/mail/ListToolbar";
import { MailAccountSwitcher } from "@/app/(app)/[emailAccountId]/mail/MailAccountSwitcher";
import {
  MAIL_CATEGORIES,
  MailSidebar,
  OUTLOOK_INBOX_CATEGORIES,
} from "@/app/(app)/[emailAccountId]/mail/MailSidebar";
import type {
  MailCategory,
  MailNavTarget,
} from "@/app/(app)/[emailAccountId]/mail/MailSidebar";
import type {
  MailboxItem,
  MailboxItemEdit,
} from "@/app/(app)/[emailAccountId]/mail/MailboxItemContextMenu";
import { ThreadActionsMenu } from "@/app/(app)/[emailAccountId]/mail/ThreadActionsMenu";
import { ShortcutsDialog } from "@/app/(app)/[emailAccountId]/mail/ShortcutsDialog";
import { SplitTabs } from "@/app/(app)/[emailAccountId]/mail/SplitTabs";
import type { MailSplitTab } from "@/app/(app)/[emailAccountId]/mail/SplitTabs";
import type {
  NewSplitDraft,
  NewSplitOption,
} from "@/app/(app)/[emailAccountId]/mail/NewSplitPopover";
import { ThreadList } from "@/app/(app)/[emailAccountId]/mail/ThreadList";
import { ThreadReader } from "@/app/(app)/[emailAccountId]/mail/ThreadReader";
import {
  getActiveThreadIndex,
  getNextThreadAfterRemoval,
  getThreadActionTargetIds,
} from "@/app/(app)/[emailAccountId]/mail/thread-list-behavior";
import {
  getListThreadKey,
  type MailLayoutMode,
} from "@/app/(app)/[emailAccountId]/mail/types";
import type { ThreadMessage } from "@/components/email-list/types";
import { useMailThreads } from "@/app/(app)/[emailAccountId]/mail/use-mail-threads";
import { useCombinedMailThreads } from "@/app/(app)/[emailAccountId]/mail/use-combined-mail-threads";
import { runCombinedThreadAction } from "@/app/(app)/[emailAccountId]/mail/combined-thread-actions";
import { useAdjacentThreadPrefetch } from "@/app/(app)/[emailAccountId]/mail/use-adjacent-thread-prefetch";
import { useHoverThreadPrefetch } from "@/app/(app)/[emailAccountId]/mail/use-hover-thread-prefetch";
import { useThreadActions } from "@/app/(app)/[emailAccountId]/mail/use-thread-actions";
import { useThreadSelection } from "@/app/(app)/[emailAccountId]/mail/use-thread-selection";
import { isThreadUnread } from "@/app/(app)/[emailAccountId]/mail/read-state";
import { MailLayout, MailSplitKind } from "@/generated/prisma/enums";
import { useChat } from "@/providers/ChatProvider";
import { Sidebar, useSidebar } from "@/components/ui/sidebar";
import { useAtom, useSetAtom } from "jotai";
import {
  commandPaletteOpenAtom,
  mailCommandContextAtom,
} from "@/store/command-palette";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import { useEmail } from "@/providers/EmailProvider";
import { useComposeModal } from "@/providers/ComposeModalProvider";
import { useDisplayedEmail } from "@/hooks/useDisplayedEmail";
import { useLabelCounts } from "@/hooks/useLabelCounts";
import { useSplitLabels } from "@/hooks/useLabels";
import { useFolders } from "@/hooks/useFolders";
import { useMailSettings } from "@/hooks/useMailSettings";
import { useThread } from "@/hooks/useThread";
import { useShortcuts } from "@/lib/shortcuts/useShortcuts";
import type { ShortcutHandlers } from "@/lib/shortcuts/registry";
import {
  createMailSplitAction,
  deleteMailSplitAction,
  updateMailPreferencesAction,
} from "@/utils/actions/mail-split";
import {
  archiveThreadAction,
  createLabelAction,
  deleteMailboxItemAction,
  removeThreadLabelAction,
  renameMailboxItemAction,
  trashThreadAction,
  updateLabelColorAction,
} from "@/utils/actions/mail";
import {
  mailSplitToThreadsQuery,
  mailTypeToThreadsQuery,
} from "@/utils/mail/split-query";
import { getActionErrorMessage } from "@/utils/error";
import { prefixPath } from "@/utils/path";
import { LoadingContent } from "@/components/LoadingContent";
import type { LabelCount } from "@/app/api/labels/counts/route";
import type { ThreadsQuery } from "@/utils/threads/validation";
import { getEmailTerminology } from "@/utils/terminology";
import { createSearchParams } from "@/utils/url";
import { redirectToSafeUrl } from "@/utils/redirect";

// Always present, never deletable. Everything else is a saved split. They carry
// a kind so built-ins and saved splits resolve through one mapping.
const BUILT_IN_SPLITS = [
  { id: "all", name: "All", kind: MailSplitKind.INBOX, value: null },
  { id: "unread", name: "Unread", kind: MailSplitKind.UNREAD, value: null },
] as const;

// Module-level so an "empty" reader doesn't hand children a new array each render.
const NO_MESSAGES: ThreadMessage[] = [];
const NO_LABELS = {};
const NO_COUNTS = new Map<string, LabelCount>();

export function MailShell() {
  const { emailAccountId, userEmail, provider } = useAccount();
  const isGoogle = isGoogleProvider(provider);
  const isOutlook = isMicrosoftProvider(provider);
  const categories = getMailCategories({ isGoogle, isOutlook });
  const terminology = getEmailTerminology(provider);
  const { userLabels } = useEmail();
  const { visibleLabels, mutate: mutateLabels } = useSplitLabels();
  const { folders, mutate: mutateFolders } = useFolders(provider);
  const { countsById, mutate: mutateCounts } = useLabelCounts();
  const { data: settings, mutate: mutateSettings } = useMailSettings();
  const { onOpen: openCompose } = useComposeModal();
  const { setInput: setChatInput } = useChat();
  const { state: openSidebars, toggleSidebar } = useSidebar();
  const [isPaletteOpen, setPaletteOpen] = useAtom(commandPaletteOpenAtom);
  const setMailCommandContext = useSetAtom(mailCommandContextAtom);
  // The side panel viewer owns the triage keys while it's open, so this screen
  // stands down rather than both archiving the same keystroke.
  const { threadId: sidePanelThreadId } = useDisplayedEmail();

  const [openThreadId, setOpenThreadId] = useQueryState("thread-id");
  const [activeSplitId, setActiveSplitId] = useQueryState("split", {
    defaultValue: "all",
  });
  const [accountScope, setAccountScope] = useQueryState("accountScope");
  const [scopeType, setScopeType] = useQueryState("type");
  const [scopeLabelId, setScopeLabelId] = useQueryState("labelId");
  const [scopeFolderId, setScopeFolderId] = useQueryState("folderId");

  const [focusedIndex, setFocusedIndex] = useState(0);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [replyToMessageId, setReplyToMessageId] = useState<string>();
  const isMailSidebarOpen = openSidebars.includes("left-sidebar");

  const isAllAccounts = accountScope === "all";
  const accountLayout: MailLayoutMode =
    settings?.layout === MailLayout.SPLIT ? "split" : "list";
  const layout = isAllAccounts ? "list" : accountLayout;

  // Written through the SWR cache rather than mirrored in local state, so the
  // preference has one source of truth and every reader sees the new value.
  const toggleLayout = useCallback(() => {
    const next = layout === "split" ? MailLayout.LIST : MailLayout.SPLIT;

    mutateSettings(
      async (current) => {
        const result = await updateMailPreferencesAction(emailAccountId, {
          layout: next,
        });
        // Thrown so SWR rolls the optimistic value back rather than leaving
        // the UI showing a preference the server never accepted.
        if (result?.serverError || result?.validationErrors)
          throw new Error(getActionErrorMessage(result));
        return {
          layout: next,
          splits: current?.splits ?? [],
        };
      },
      {
        optimisticData: (current) => ({
          layout: next,
          splits: current?.splits ?? [],
        }),
        revalidate: false,
        rollbackOnError: true,
      },
    ).catch((error) => {
      toast.error(
        error instanceof Error ? error.message : "Couldn't save that",
      );
    });
  }, [emailAccountId, layout, mutateSettings]);

  // A sidebar selection scopes the whole list, which replaces the split tabs —
  // splits are a way of slicing the inbox, not of slicing an arbitrary view.
  // Resolved once so the tab bar and the fetched rows can't disagree.
  const scopeQuery: ThreadsQuery | null = useMemo(() => {
    if (scopeLabelId) return { labelId: scopeLabelId };
    if (scopeFolderId) return { folderId: scopeFolderId };
    if (scopeType && scopeType !== "inbox")
      return mailTypeToThreadsQuery(scopeType);
    return null;
  }, [scopeFolderId, scopeLabelId, scopeType]);
  const isScoped = !isAllAccounts && scopeQuery !== null;

  const splits: MailSplitTab[] = useMemo(() => {
    const builtInSplits = BUILT_IN_SPLITS.map((split) => ({
      id: split.id,
      name: split.name,
      deletable: false,
    }));
    if (isAllAccounts) return builtInSplits;

    return [
      ...builtInSplits,
      ...(settings?.splits ?? []).map((split) => ({
        id: split.id,
        name: split.name,
        deletable: true,
      })),
    ];
  }, [isAllAccounts, settings?.splits]);

  const query: ThreadsQuery = useMemo(() => {
    if (scopeQuery) return scopeQuery;

    const active =
      settings?.splits?.find((split) => split.id === activeSplitId) ??
      BUILT_IN_SPLITS.find((split) => split.id === activeSplitId) ??
      BUILT_IN_SPLITS[0];

    return mailSplitToThreadsQuery(active);
  }, [scopeQuery, activeSplitId, settings?.splits]);

  const accountThreadState = useMailThreads({
    emailAccountId,
    query,
    enabled: !isAllAccounts,
  });
  const combinedThreadState = useCombinedMailThreads({
    emailAccountId,
    enabled: isAllAccounts,
    isUnread: activeSplitId === "unread",
  });
  const {
    labelsByAccount,
    removeThreads: removeCombinedThreads,
    restoreThreads: restoreCombinedThreads,
  } = combinedThreadState;
  const { threads, isLoading, error, hasMore, isLoadingMore, loadMore } =
    isAllAccounts ? combinedThreadState : accountThreadState;

  const orderedIds = useMemo(() => threads.map(getListThreadKey), [threads]);
  const selection = useThreadSelection(orderedIds);
  const { archive, trash, markRead, setReadState, snooze, undo } =
    useThreadActions({
      emailAccountId,
      removeThreads: accountThreadState.removeThreads,
      restoreThreads: accountThreadState.restoreThreads,
      optimisticallyUpdateThreads:
        accountThreadState.optimisticallyUpdateThreads,
    });

  const clampIndex = useCallback(
    (index: number) =>
      Math.min(Math.max(0, index), Math.max(0, threads.length - 1)),
    [threads.length],
  );
  const clampedIndex = getActiveThreadIndex({
    threadIds: orderedIds,
    focusedIndex,
    openThreadId,
  });
  const focusedThread = threads[clampedIndex];
  const openThread =
    !isAllAccounts && openThreadId === focusedThread?.id
      ? focusedThread
      : undefined;
  const resolvedOpenThreadId = openThread?.id;
  const readAttemptedForOpenThread = useRef<string | null>(null);

  useEffect(() => {
    if (!openThreadId) {
      readAttemptedForOpenThread.current = null;
      return;
    }
    if (
      !resolvedOpenThreadId ||
      readAttemptedForOpenThread.current === resolvedOpenThreadId
    ) {
      return;
    }

    // A rollback leaves the reader open. Remember the attempt so a provider
    // failure doesn't immediately enqueue the same mutation again.
    readAttemptedForOpenThread.current = resolvedOpenThreadId;
    markRead([resolvedOpenThreadId]);
  }, [markRead, openThreadId, resolvedOpenThreadId]);

  // Deferred so holding J/K in split view doesn't fire a full-thread provider
  // fetch for every row the cursor passes over — only the row you settle on.
  const readerThreadId = useDeferredValue(isAllAccounts ? null : openThreadId);
  useAdjacentThreadPrefetch({
    currentThreadId: readerThreadId,
    emailAccountId,
    threadIds: isAllAccounts ? [] : orderedIds,
  });
  const { schedulePrefetch, cancelPrefetch } = useHoverThreadPrefetch({
    emailAccountId,
  });
  const prefetchThreadAt = useCallback(
    (index: number) => {
      const thread = threads[index];
      // Combined-view rows belong to other accounts, so this hook's account
      // can't prefetch them; hover prefetch serves the single-account list.
      if (!thread || "account" in thread) return;
      schedulePrefetch(thread.id);
    },
    [schedulePrefetch, threads],
  );
  const {
    data: openThreadData,
    error: openThreadError,
    isLoading: isOpenThreadLoading,
    mutate: refetchOpenThread,
  } = useThread({ id: readerThreadId }, { includeDrafts: true });
  // Withheld until the deferred id catches up, so a fast J/K can't pair the new
  // thread's header with the previous thread's body.
  const openMessages =
    readerThreadId === openThreadId
      ? (openThreadData?.thread.messages ?? NO_MESSAGES)
      : NO_MESSAGES;

  // The row, not the fetched thread: marking read patches the row optimistically,
  // so it is the copy that stays in step. The fetch only stands in for a link
  // straight into a conversation, where there is no row yet.
  const isOpenThreadUnread = isThreadUnread(
    openThread?.messages ?? openMessages,
  );

  const hrefFor = useCallback(
    (target: MailNavTarget) =>
      prefixPath(emailAccountId, getMailNavPath(target)),
    [emailAccountId],
  );

  const labelHref = useCallback(
    (labelId: string) => hrefFor({ kind: "label", labelId }),
    [hrefFor],
  );

  const runOn = useCallback(
    (
      action: (ids: string[]) => void,
      removeFromList: boolean,
      autoAdvanceReader = false,
    ) => {
      if (isAllAccounts) return;
      const ids = getThreadActionTargetIds({
        openThreadId,
        activeThreadId: focusedThread
          ? getListThreadKey(focusedThread)
          : undefined,
        selectedThreadIds: [...selection.selectedIds],
      });
      if (!ids.length) return;
      if (removeFromList && openThreadId && ids.includes(openThreadId)) {
        if (autoAdvanceReader) {
          const nextThread = getNextThreadAfterRemoval({
            threadIds: orderedIds,
            currentThreadId: openThreadId,
            removedThreadIds: ids,
          });
          setFocusedIndex(nextThread?.index ?? 0);
          setOpenThreadId(nextThread?.id ?? null);
        } else {
          setOpenThreadId(null);
        }
      }
      selection.clear();
      action(ids);
    },
    [
      focusedThread,
      isAllAccounts,
      openThreadId,
      orderedIds,
      selection,
      setOpenThreadId,
    ],
  );

  const openAt = useCallback(
    (index: number) => {
      const thread = threads[index];
      if (!thread) return;
      setFocusedIndex(index);
      setReplyToMessageId(undefined);
      if ("account" in thread) {
        const params = createSearchParams({ "thread-id": thread.id });
        redirectToSafeUrl(`/${thread.account.id}/mail?${params.toString()}`);
        return;
      }
      setOpenThreadId(thread.id);
    },
    [threads, setOpenThreadId],
  );

  const move = useCallback(
    (delta: number) => {
      const next = clampIndex(clampedIndex + delta);
      setFocusedIndex(next);
      // Once a reader is open, navigation keeps its content and position in
      // step. A closed list view still lets J/K move the row cursor alone —
      // there the cursor still signals intent, so warm the row for Enter.
      if ((layout === "split" || openThreadId) && threads[next])
        setOpenThreadId(threads[next].id);
      else prefetchThreadAt(next);
    },
    [
      clampIndex,
      clampedIndex,
      threads,
      layout,
      openThreadId,
      prefetchThreadAt,
      setOpenThreadId,
    ],
  );

  const extendSelection = useCallback(
    (delta: number) => {
      const next = clampIndex(clampedIndex + delta);
      selection.extendTo(next, clampedIndex);
      setFocusedIndex(next);
    },
    [clampIndex, clampedIndex, selection],
  );

  const openShortcuts = useCallback(() => setIsHelpOpen(true), []);
  const runCombinedAction = useCallback(
    async ({
      action,
      successVerb,
      actionVerb,
      failureDescription,
    }: {
      action: (emailAccountId: string, threadId: string) => Promise<unknown>;
      successVerb: string;
      actionVerb: string;
      failureDescription: string;
    }) => {
      const targetKeys = selection.targetIds(
        focusedThread ? getListThreadKey(focusedThread) : undefined,
      );
      const targets: Array<{ id: string; account: { id: string } }> = [];
      for (const thread of threads) {
        if (
          !("account" in thread) ||
          !targetKeys.includes(getListThreadKey(thread))
        ) {
          continue;
        }
        targets.push({ id: thread.id, account: { id: thread.account.id } });
      }
      if (!targets.length) return;

      const removal = removeCombinedThreads(targetKeys);
      selection.clear();
      const { failedThreadKeys, succeededThreadKeys } =
        await runCombinedThreadAction({ threads: targets, action });
      restoreCombinedThreads(removal, failedThreadKeys);

      if (succeededThreadKeys.length) {
        toast.success(
          summariseCombinedAction(successVerb, succeededThreadKeys.length),
        );
      }
      if (failedThreadKeys.length) {
        toast.error(
          failedThreadKeys.length === targets.length
            ? `There was an error ${failureDescription}`
            : `Couldn't ${actionVerb} ${failedThreadKeys.length} of ${targets.length} conversations`,
        );
      }
    },
    [
      focusedThread,
      removeCombinedThreads,
      restoreCombinedThreads,
      selection,
      threads,
    ],
  );
  const archiveTargets = useCallback(async () => {
    if (!isAllAccounts) {
      runOn(archive, true, true);
      return;
    }
    await runCombinedAction({
      action: (accountId, threadId) =>
        archiveThreadAction(accountId, { threadId }),
      successVerb: "Archived",
      actionVerb: "archive",
      failureDescription: "archiving",
    });
  }, [archive, isAllAccounts, runCombinedAction, runOn]);
  const trashTargets = useCallback(async () => {
    if (!isAllAccounts) {
      runOn(trash, true);
      return;
    }
    await runCombinedAction({
      action: (accountId, threadId) =>
        trashThreadAction(accountId, { threadId }),
      successVerb: "Deleted",
      actionVerb: "delete",
      failureDescription: "deleting",
    });
  }, [isAllAccounts, runCombinedAction, runOn, trash]);
  const markReadTargets = useCallback(
    () => runOn(markRead, false),
    [runOn, markRead],
  );
  const markUnreadTargets = useCallback(
    () => runOn((ids) => setReadState(ids, false), false),
    [runOn, setReadState],
  );
  const snoozeTargets = useCallback(
    (until: Date) => runOn((ids) => snooze(ids, until), true),
    [runOn, snooze],
  );
  const commandTargetIds = useMemo(
    () =>
      selection.targetIds(
        focusedThread ? getListThreadKey(focusedThread) : undefined,
      ),
    [selection, focusedThread],
  );
  const commandTargets = useMemo(() => {
    const ids = new Set(commandTargetIds);
    return threads.filter((thread) => ids.has(getListThreadKey(thread)));
  }, [commandTargetIds, threads]);
  const mailCommandContext = useMemo(
    () => ({
      actions: isAllAccounts
        ? { archive: archiveTargets, trash: trashTargets }
        : {
            archive: archiveTargets,
            markRead: markReadTargets,
            markUnread: markUnreadTargets,
            snooze: snoozeTargets,
            trash: trashTargets,
          },
      hasRead: commandTargets.some(
        (thread) => !isThreadUnread(thread.messages),
      ),
      hasUnread: commandTargets.some((thread) =>
        isThreadUnread(thread.messages),
      ),
      targetCount: commandTargetIds.length,
    }),
    [
      archiveTargets,
      commandTargetIds.length,
      commandTargets,
      isAllAccounts,
      markReadTargets,
      markUnreadTargets,
      snoozeTargets,
      trashTargets,
    ],
  );

  useEffect(() => {
    setMailCommandContext(
      mailCommandContext.targetCount ? mailCommandContext : null,
    );
    return () => setMailCommandContext(null);
  }, [mailCommandContext, setMailCommandContext]);
  const isMailOverlayOpen =
    isHelpOpen || isPaletteOpen || (isMenuOpen && Boolean(openThreadId));

  // Not memoised: `useShortcuts` keeps handlers in a ref and only re-registers
  // when the set of handled ids changes, so a stable identity buys nothing.
  const handlers: ShortcutHandlers = (() => {
    if (sidePanelThreadId) return {};
    return {
      next: () => move(1),
      previous: () => move(-1),
      open: () => openAt(clampedIndex),
      backToList: isMailOverlayOpen
        ? undefined
        : () => {
            if (isFocusMode) setIsFocusMode(false);
            else if (selection.hasSelection) selection.clear();
            else if (layout === "list") setOpenThreadId(null);
          },
      nextSplit: () => {
        const index = splits.findIndex((s) => s.id === activeSplitId);
        const next = splits[(index + 1) % splits.length];
        if (next) setActiveSplitId(next.id);
      },
      select: () => selection.toggle(clampedIndex),
      // The cursor travels with the extension; without that, every repeat
      // re-extends from the same row and the range never grows.
      extendSelectionDown: () => extendSelection(1),
      extendSelectionUp: () => extendSelection(-1),
      archive: archiveTargets,
      delete: trashTargets,
      reply: isAllAccounts
        ? undefined
        : () => {
            if (!openThreadId && focusedThread)
              setOpenThreadId(focusedThread.id);
            setReplyToMessageId(openMessages?.at(-1)?.id);
          },
      moreActions: isAllAccounts
        ? undefined
        : () => setIsMenuOpen((open) => !open),
      undo: isAllAccounts ? undefined : () => undo(),
      toggleLayout: isAllAccounts ? undefined : toggleLayout,
      focusMode: isAllAccounts ? undefined : () => setIsFocusMode((on) => !on),
      help: () => setIsHelpOpen(true),
    };
  })();

  useShortcuts(handlers);

  const categoryGroup: NewSplitOption["group"] = isOutlook
    ? "inbox"
    : "category";
  const newSplitOptions: NewSplitOption[] = useMemo(
    () => [
      {
        id: "state:unread",
        name: "Unread",
        kind: MailSplitKind.UNREAD,
        value: null,
        group: "state",
      },
      ...categories.map((category) => ({
        id: `category:${category.type}`,
        name: category.name,
        kind: MailSplitKind.CATEGORY,
        value: category.type,
        group: categoryGroup,
      })),
      ...visibleLabels.map((label) => ({
        id: `label:${label.id}`,
        name: label.name,
        kind: MailSplitKind.LABEL,
        value: label.id,
        group: "label" as const,
      })),
    ],
    [categories, categoryGroup, visibleLabels],
  );

  const onCreateSplit = useCallback(
    async (draft: NewSplitDraft) => {
      const result = await createMailSplitAction(emailAccountId, draft);
      if (result?.serverError || result?.validationErrors) {
        toast.error(getActionErrorMessage(result));
        return;
      }
      mutateSettings();
    },
    [emailAccountId, mutateSettings],
  );

  const onDeleteSplit = useCallback(
    async (splitId: string) => {
      if (activeSplitId === splitId) setActiveSplitId("all");
      const result = await deleteMailSplitAction(emailAccountId, {
        id: splitId,
      });
      if (result?.serverError || result?.validationErrors) {
        toast.error(getActionErrorMessage(result));
        return;
      }
      mutateSettings();
    },
    [emailAccountId, mutateSettings, activeSplitId, setActiveSplitId],
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
      const result =
        "color" in edit
          ? await updateLabelColorAction(emailAccountId, {
              labelId: edit.id,
              color: edit.color,
            })
          : await renameMailboxItemAction(emailAccountId, {
              kind: edit.kind,
              id: edit.id,
              name: edit.name,
            });

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

      const isActive =
        item.kind === "folder"
          ? scopeFolderId === item.id
          : scopeLabelId === item.id;
      if (isActive) {
        await Promise.all([
          setOpenThreadId(null),
          setScopeType("inbox"),
          item.kind === "folder"
            ? setScopeFolderId(null)
            : setScopeLabelId(null),
        ]);
      }
      await Promise.all([
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
      scopeFolderId,
      scopeLabelId,
      setOpenThreadId,
      setScopeFolderId,
      setScopeLabelId,
      setScopeType,
      terminology.label.singularCapitalized,
    ],
  );

  const onRemoveLabel = useCallback(
    async (labelId: string) => {
      if (!openThreadId) return;
      const result = await removeThreadLabelAction(emailAccountId, {
        threadId: openThreadId,
        labelId,
      });
      if (result?.serverError || result?.validationErrors) {
        toast.error(getActionErrorMessage(result));
        return;
      }
      refetchOpenThread();
    },
    [emailAccountId, openThreadId, refetchOpenThread],
  );

  const showList =
    isAllAccounts || (!isFocusMode && (layout === "split" || !openThreadId));
  const showReader =
    !isAllAccounts && (layout === "split" || Boolean(openThreadId));

  const selectAllAccounts = useCallback(() => {
    selection.clear();
    setFocusedIndex(0);
    setOpenThreadId(null);
    setScopeType(null);
    setScopeLabelId(null);
    setScopeFolderId(null);
    if (!BUILT_IN_SPLITS.some((split) => split.id === activeSplitId)) {
      setActiveSplitId("all");
    }
    setAccountScope("all");
  }, [
    activeSplitId,
    selection.clear,
    setAccountScope,
    setActiveSplitId,
    setOpenThreadId,
    setScopeFolderId,
    setScopeLabelId,
    setScopeType,
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex min-h-0 flex-1">
        <div className="hidden [--sidebar-width:236px] lg:contents">
          <Sidebar name="left-sidebar" forceCollapsed={isFocusMode}>
            <MailSidebar
              className="h-full w-full border-r-0"
              activeType={
                scopeLabelId || scopeFolderId ? null : (scopeType ?? "inbox")
              }
              activeLabelId={scopeLabelId}
              activeFolderId={scopeFolderId}
              hrefFor={hrefFor}
              labels={isAllAccounts ? [] : visibleLabels}
              folders={isAllAccounts || !isOutlook ? [] : folders}
              countsById={isAllAccounts ? NO_COUNTS : countsById}
              categories={isAllAccounts ? [] : categories}
              categoryHeading={isOutlook ? "Inbox" : "Categories"}
              labelsHeading={terminology.label.pluralCapitalized}
              labelSingular={terminology.label.singular}
              backToAppHref={prefixPath(emailAccountId, "/automation")}
              onCompose={openCompose}
              onCreateLabel={onCreateLabel}
              onEditMailboxItem={onEditMailboxItem}
              onDeleteMailboxItem={onDeleteMailboxItem}
              onOpenShortcuts={openShortcuts}
              labelEditMode={isOutlook ? "color" : "name"}
              unified={isAllAccounts}
              footer={
                <MailAccountSwitcher
                  isAllAccounts={isAllAccounts}
                  onSelectAll={selectAllAccounts}
                  variant="sidebar"
                />
              }
            />
          </Sidebar>
        </div>

        {showList && (
          <section
            className={
              layout === "split"
                ? "flex min-h-0 w-[clamp(258px,32vw,400px)] shrink-0 flex-col border-r border-border"
                : // min-w-0 matters: a flex item won't shrink below its content
                  // width without it, so long snippets would widen the column
                  // past the viewport instead of truncating.
                  "flex min-h-0 min-w-0 flex-1 flex-col"
            }
          >
            <ListToolbar
              layout={layout}
              onOpenSearch={() => setPaletteOpen(true)}
              onToggleLayout={toggleLayout}
              onToggleAssistant={() => toggleSidebar(["chat-sidebar"])}
              showSidebarToggle={!isMailSidebarOpen}
              showLayoutToggle={!isAllAccounts}
            />
            {!isScoped && (
              <SplitTabs
                splits={splits}
                activeSplitId={activeSplitId}
                onSelect={setActiveSplitId}
                onDelete={onDeleteSplit}
                newSplitOptions={newSplitOptions}
                onCreateSplit={onCreateSplit}
              />
            )}
            {isAllAccounts && combinedThreadState.failedAccountIds.length ? (
              <div className="border-border border-b bg-amber-50 px-3 py-2 text-amber-900 text-xs dark:bg-amber-950/30 dark:text-amber-200">
                Some inboxes couldn&apos;t be loaded. Try again shortly or check
                their connections.
              </div>
            ) : null}
            <LoadingContent
              loading={isLoading && !threads.length}
              error={error}
            >
              <ThreadList
                threads={threads}
                layout={layout}
                userEmail={userEmail}
                userLabels={isAllAccounts ? NO_LABELS : userLabels}
                labelsByAccount={labelsByAccount}
                focusedIndex={clampedIndex}
                isSelected={selection.isSelected}
                selectedCount={selection.selectedCount}
                onOpenThread={openAt}
                onToggleSelect={selection.toggle}
                onSelectRangeTo={selection.selectRangeTo}
                onPrefetchThread={prefetchThreadAt}
                onPrefetchCancel={cancelPrefetch}
                onArchiveSelected={archiveTargets}
                onDeleteSelected={trashTargets}
                onClearSelection={selection.clear}
                emptyTitle="Nothing in this view"
                showLoadMore={hasMore}
                isLoadingMore={isLoadingMore}
                onLoadMore={loadMore}
                listKey={
                  isAllAccounts
                    ? `all-accounts:${activeSplitId}`
                    : JSON.stringify(query)
                }
              />
            </LoadingContent>
          </section>
        )}

        {showReader && (
          <ThreadReader
            key={openThreadId ?? "empty"}
            thread={openThread ?? null}
            threadId={openThreadId}
            loading={
              Boolean(openThreadId) &&
              (readerThreadId !== openThreadId || isOpenThreadLoading)
            }
            error={
              readerThreadId === openThreadId ? openThreadError : undefined
            }
            messages={openMessages ?? []}
            userEmail={userEmail}
            userLabels={userLabels}
            layout={layout}
            isFocusMode={isFocusMode}
            position={
              openThread
                ? { index: clampedIndex + 1, total: threads.length }
                : undefined
            }
            labelHref={labelHref}
            onRemoveLabel={onRemoveLabel}
            onBack={() => {
              setIsFocusMode(false);
              setOpenThreadId(null);
            }}
            onArchive={archiveTargets}
            onDelete={trashTargets}
            onReply={() => setReplyToMessageId(openMessages?.at(-1)?.id)}
            onToggleFocusMode={() => setIsFocusMode((on) => !on)}
            showSidebarToggle={!isMailSidebarOpen}
            refetch={refetchOpenThread}
            autoOpenReplyForMessageId={replyToMessageId}
            menu={
              <ThreadActionsMenu
                plans={openThread?.plans ?? []}
                message={openMessages?.at(-1) ?? null}
                setChatInput={setChatInput}
                isUnread={isOpenThreadUnread}
                onToggleRead={() => {
                  if (openThreadId)
                    setReadState([openThreadId], isOpenThreadUnread);
                }}
                open={isMenuOpen}
                onOpenChange={setIsMenuOpen}
              />
            }
          />
        )}
      </div>

      <MailAccountSwitcher
        isAllAccounts={isAllAccounts}
        onSelectAll={selectAllAccounts}
        variant="compact"
      />

      <ShortcutsDialog open={isHelpOpen} onOpenChange={setIsHelpOpen} />
    </div>
  );
}

function summariseCombinedAction(verb: string, count: number) {
  return count === 1 ? verb : `${verb} ${count} conversations`;
}

function getMailCategories({
  isGoogle,
  isOutlook,
}: {
  isGoogle: boolean;
  isOutlook: boolean;
}): MailCategory[] {
  if (isGoogle) return MAIL_CATEGORIES;
  if (isOutlook) return OUTLOOK_INBOX_CATEGORIES;
  return [];
}

function getMailNavPath(target: MailNavTarget): `/${string}` {
  switch (target.kind) {
    case "label":
      return `/mail?type=label&labelId=${encodeURIComponent(target.labelId)}`;
    case "folder":
      return `/mail?type=folder&folderId=${encodeURIComponent(target.folderId)}`;
    case "type":
      return `/mail?type=${encodeURIComponent(target.type)}`;
  }
}
