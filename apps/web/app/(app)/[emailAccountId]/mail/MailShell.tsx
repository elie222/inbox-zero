"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { parseAsString, useQueryState, useQueryStates } from "nuqs";
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
  getListThreadSelection,
  getThreadSelectionKey,
  type MailLayoutMode,
  type ThreadSelection,
} from "@/app/(app)/[emailAccountId]/mail/types";
import type { ThreadMessage } from "@/components/email-list/types";
import { useMailThreads } from "@/app/(app)/[emailAccountId]/mail/use-mail-threads";
import { useCombinedMailThreads } from "@/app/(app)/[emailAccountId]/mail/use-combined-mail-threads";
import { useAdjacentThreadPrefetch } from "@/app/(app)/[emailAccountId]/mail/use-adjacent-thread-prefetch";
import { useThreadPrefetchCoordinator } from "@/app/(app)/[emailAccountId]/mail/thread-prefetch-coordinator";
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
import {
  EmailAccountScopeProvider,
  useAccount,
} from "@/providers/EmailAccountProvider";
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
import { useAccounts } from "@/hooks/useAccounts";
import { useThread } from "@/hooks/useThread";
import { useShortcuts } from "@/lib/shortcuts/useShortcuts";
import type { ShortcutHandlers } from "@/lib/shortcuts/registry";
import {
  createMailSplitAction,
  createMailSplitFromPromptAction,
  deleteMailSplitAction,
  setDefaultMailSplitsAction,
  updateMailPreferencesAction,
} from "@/utils/actions/mail-split";
import {
  createLabelAction,
  deleteMailboxItemAction,
  removeThreadLabelAction,
  updateMailboxItemAction,
} from "@/utils/actions/mail";
import {
  getPortableLabelSplits,
  mailSplitToThreadsQuery,
  mailTypeToThreadsQuery,
} from "@/utils/mail/split-query";
import { getActionErrorMessage } from "@/utils/error";
import { prefixPath } from "@/utils/path";
import { LoadingContent } from "@/components/LoadingContent";
import type { LabelCount } from "@/app/api/labels/counts/route";
import type { ThreadsQuery } from "@/utils/threads/validation";
import { getEmailTerminology } from "@/utils/terminology";
import { GMAIL_LABEL_COLORS } from "@/utils/gmail/label-colors";
import { OUTLOOK_CATEGORY_COLORS } from "@/utils/outlook/category-colors";

// Always present, never deletable. Everything else is a saved split. They carry
// a kind so built-ins and saved splits resolve through one mapping.
const BUILT_IN_SPLITS = [
  { id: "all", name: "All", kind: MailSplitKind.INBOX, value: null },
  { id: "unread", name: "Unread", kind: MailSplitKind.UNREAD, value: null },
] as const;

// Module-level so an "empty" reader doesn't hand children a new array each render.
const NO_MESSAGES: ThreadMessage[] = [];
const NO_LABELS = {};
const OUTLOOK_LABEL_COLOR_OPTIONS = OUTLOOK_CATEGORY_COLORS.map((option) => ({
  name: option.name,
  backgroundColor: option.value,
  textColor: "#000000",
}));
const NO_COUNTS = new Map<string, LabelCount>();

export function MailShell() {
  const { emailAccount, emailAccountId, userEmail, provider } = useAccount();
  const { data: accountsData } = useAccounts();
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

  const [openThreadQuery, setOpenThreadQuery] = useQueryStates({
    "thread-id": parseAsString,
    "thread-account-id": parseAsString,
  });
  const openThreadId = openThreadQuery["thread-id"];
  const openThreadAccountId = openThreadQuery["thread-account-id"];
  const [activeSplitId, setActiveSplitId] = useQueryState("split", {
    defaultValue: "all",
  });
  const activeSplitIdRef = useRef(activeSplitId);
  activeSplitIdRef.current = activeSplitId;
  const [accountScope, setAccountScope] = useQueryState("accountScope");
  const [scopeType, setScopeType] = useQueryState("type");
  const [scopeLabelId, setScopeLabelId] = useQueryState("labelId");
  const [scopeFolderId, setScopeFolderId] = useQueryState("folderId");
  const [searchParam, setSearchParam] = useQueryState("q");

  const [focusedIndex, setFocusedIndex] = useState(0);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [replyToMessageId, setReplyToMessageId] = useState<string>();
  const pendingReplyThreadKey = useRef<string | null>(null);
  const isMailSidebarOpen = openSidebars.includes("left-sidebar");

  const isAllAccounts = accountScope === "all";
  const setOpenThread = useCallback(
    (selection: ThreadSelection | null) =>
      setOpenThreadQuery({
        "thread-id": selection?.threadId ?? null,
        "thread-account-id":
          isAllAccounts && selection ? selection.emailAccountId : null,
      }),
    [isAllAccounts, setOpenThreadQuery],
  );
  const combinedAccounts = useMemo(
    () =>
      (accountsData?.emailAccounts ?? [])
        .filter(
          (emailAccount) =>
            emailAccount.includeInAllAccounts &&
            emailAccount.account.disconnectedAt === null,
        )
        .map(({ id, email, name, image }) => ({
          id,
          email,
          name,
          image,
        })),
    [accountsData?.emailAccounts],
  );
  const accountLayout: MailLayoutMode =
    settings?.layout === MailLayout.SPLIT ? "split" : "list";
  const layout = isAllAccounts ? "list" : accountLayout;

  // Written through the SWR cache rather than mirrored in local state, so the
  // preference has one source of truth and every reader sees the new value.
  const toggleLayout = useCallback(() => {
    if (!settings) return;

    const next = layout === "split" ? MailLayout.LIST : MailLayout.SPLIT;
    const loadedSettings = settings;

    mutateSettings(
      async (current) => {
        const result = await updateMailPreferencesAction(emailAccountId, {
          layout: next,
        });
        // Thrown so SWR rolls the optimistic value back rather than leaving
        // the UI showing a preference the server never accepted.
        if (result?.serverError || result?.validationErrors)
          throw new Error(getActionErrorMessage(result));
        return { ...(current ?? loadedSettings), layout: next };
      },
      {
        optimisticData: (current) => ({
          ...(current ?? loadedSettings),
          layout: next,
        }),
        revalidate: false,
        rollbackOnError: true,
      },
    ).catch((error) => {
      toast.error(
        error instanceof Error ? error.message : "Couldn't save that",
      );
    });
  }, [emailAccountId, layout, mutateSettings, settings]);

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

  // Combined inboxes can't search across accounts, so search is single-account.
  const searchQuery = isAllAccounts ? null : searchParam?.trim() || null;
  const setSearch = useCallback(
    (value: string) => setSearchParam(value.trim() || null),
    [setSearchParam],
  );

  const combinedLabelSplits = useMemo(
    () => getPortableLabelSplits(settings?.splits ?? [], userLabels),
    [settings?.splits, userLabels],
  );

  const splits: MailSplitTab[] = useMemo(() => {
    const builtInSplits = BUILT_IN_SPLITS.map((split) => ({
      id: split.id,
      name: split.name,
      deletable: false,
    }));
    return [
      ...builtInSplits,
      ...(isAllAccounts ? combinedLabelSplits : (settings?.splits ?? [])).map(
        (split) => ({
          id: split.id,
          name: split.name,
          deletable: true,
        }),
      ),
    ];
  }, [combinedLabelSplits, isAllAccounts, settings?.splits]);
  const displayedActiveSplitId =
    splits.find((split) => split.id === activeSplitId)?.id ?? "all";
  const activeCombinedLabelName = combinedLabelSplits.find(
    (split) => split.id === displayedActiveSplitId,
  )?.labelName;
  const savedDefaultSplits = useMemo(() => {
    const defaultLabelIds = new Set(
      (settings?.defaultSplits ?? []).map((split) => split.value),
    );
    return (settings?.splits ?? []).filter(
      (split) =>
        split.kind === MailSplitKind.LABEL &&
        split.value &&
        defaultLabelIds.has(split.value),
    );
  }, [settings?.defaultSplits, settings?.splits]);
  const canAddDefaultSplits = (settings?.defaultSplits ?? []).some(
    (defaultSplit) =>
      !(settings?.splits ?? []).some(
        (split) =>
          split.name === defaultSplit.name ||
          (split.kind === MailSplitKind.LABEL &&
            split.value === defaultSplit.value),
      ),
  );
  const canRemoveDefaultSplits = savedDefaultSplits.length > 0;

  const query: ThreadsQuery = useMemo(() => {
    // Search overrides split/scope and covers the whole mailbox, matching
    // what Gmail's and Outlook's own search boxes do by default.
    if (searchQuery) return { q: searchQuery };
    if (scopeQuery) return scopeQuery;

    const active =
      settings?.splits?.find((split) => split.id === activeSplitId) ??
      BUILT_IN_SPLITS.find((split) => split.id === activeSplitId) ??
      BUILT_IN_SPLITS[0];

    return mailSplitToThreadsQuery(active);
  }, [searchQuery, scopeQuery, activeSplitId, settings?.splits]);

  const accountThreadState = useMailThreads({
    emailAccountId,
    query,
    enabled: !isAllAccounts,
  });
  const combinedThreadState = useCombinedMailThreads({
    accounts: combinedAccounts,
    emailAccountId,
    enabled: isAllAccounts,
    isUnread: displayedActiveSplitId === "unread",
    labelName: activeCombinedLabelName,
  });
  const { labelsByAccount } = combinedThreadState;
  const { threads, isLoading, error, hasMore, isLoadingMore, loadMore } =
    isAllAccounts ? combinedThreadState : accountThreadState;

  const orderedIds = useMemo(() => threads.map(getListThreadKey), [threads]);
  const selection = useThreadSelection(orderedIds);

  const clampIndex = useCallback(
    (index: number) =>
      Math.min(Math.max(0, index), Math.max(0, threads.length - 1)),
    [threads.length],
  );
  const openThreadSelection = useMemo<ThreadSelection | null>(() => {
    if (!openThreadId) return null;
    const ownerEmailAccountId = isAllAccounts
      ? openThreadAccountId
      : emailAccountId;
    if (!ownerEmailAccountId) return null;
    return {
      emailAccountId: ownerEmailAccountId,
      threadId: openThreadId,
    };
  }, [emailAccountId, isAllAccounts, openThreadAccountId, openThreadId]);
  const openThreadKey = isAllAccounts
    ? getThreadSelectionKey(openThreadSelection)
    : openThreadId;
  const clampedIndex = getActiveThreadIndex({
    threadIds: orderedIds,
    focusedIndex,
    openThreadId: openThreadKey,
  });
  const focusedThread = threads[clampedIndex];
  const openThread = openThreadKey
    ? threads.find((thread) => getListThreadKey(thread) === openThreadKey)
    : undefined;
  const readAttemptedForOpenThread = useRef<string | null>(null);

  // Defer the pair as one value: rendering a new id with the previous account
  // would be worse than fetching eagerly when J/K moves between account rows.
  const deferredReaderSelection = useDeferredValue(openThreadSelection);
  const readerThreadKey = getThreadSelectionKey(deferredReaderSelection);
  const openReaderThreadKey = getThreadSelectionKey(openThreadSelection);
  const readerSelectionSettled = readerThreadKey === openReaderThreadKey;
  const threadPrefetchCoordinator = useThreadPrefetchCoordinator();
  const adjacentPrefetchScopeKey = `adjacent:${readerThreadKey ?? "none"}`;
  const threadSelections = useMemo(
    () =>
      threads.map((thread) => getListThreadSelection(thread, emailAccountId)),
    [emailAccountId, threads],
  );
  useAdjacentThreadPrefetch({
    coordinator: threadPrefetchCoordinator,
    currentThread: deferredReaderSelection,
    scopeKey: adjacentPrefetchScopeKey,
    threads: threadSelections,
  });
  const {
    data: openThreadData,
    error: openThreadError,
    isLoading: isOpenThreadLoading,
    mutate: refetchOpenThread,
  } = useThread(
    {
      id: deferredReaderSelection?.threadId ?? null,
      emailAccountId: deferredReaderSelection?.emailAccountId,
    },
    { includeDrafts: true },
  );
  // Withheld until the deferred id catches up, so a fast J/K can't pair the new
  // thread's header with the previous thread's body.
  const openMessages = readerSelectionSettled
    ? (openThreadData?.thread.messages ?? NO_MESSAGES)
    : NO_MESSAGES;
  const readerTarget = useMemo(() => {
    if (!openThreadKey || !openThreadSelection || !readerSelectionSettled)
      return;
    const messageIds = [...new Set(openMessages.map((message) => message.id))];
    if (!messageIds.length) return;
    return {
      emailAccountId: openThreadSelection.emailAccountId,
      key: openThreadKey,
      messageIds,
      threadId: openThreadSelection.threadId,
    };
  }, [
    openMessages,
    openThreadKey,
    openThreadSelection,
    readerSelectionSettled,
  ]);
  const { archive, trash, markRead, markSpam, setReadState, snooze, undo } =
    useThreadActions({
      emailAccountId,
      readerTarget,
      threads,
    });
  const requestReaderReply = useCallback(() => {
    const messageId = openMessages.at(-1)?.id;
    if (messageId) {
      pendingReplyThreadKey.current = null;
      setReplyToMessageId(messageId);
      return;
    }

    pendingReplyThreadKey.current = openReaderThreadKey;
  }, [openMessages, openReaderThreadKey]);

  useEffect(() => {
    const pendingThreadKey = pendingReplyThreadKey.current;
    if (!pendingThreadKey) return;
    if (pendingThreadKey !== openReaderThreadKey) {
      pendingReplyThreadKey.current = null;
      return;
    }

    const messageId = openMessages.at(-1)?.id;
    if (!readerSelectionSettled || !messageId) return;

    pendingReplyThreadKey.current = null;
    setReplyToMessageId(messageId);
  }, [openMessages, openReaderThreadKey, readerSelectionSettled]);

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
    (labelId: string) =>
      prefixPath(
        openThreadSelection?.emailAccountId ?? emailAccountId,
        getMailNavPath({ kind: "label", labelId }),
      ),
    [emailAccountId, openThreadSelection?.emailAccountId],
  );

  const runOn = useCallback(
    async (
      action: (ids: string[]) => Promise<string[]>,
      removeFromList: boolean,
      autoAdvanceReader = false,
    ) => {
      const ids = getThreadActionTargetIds({
        openThreadId: openThreadKey,
        activeThreadId: focusedThread
          ? getListThreadKey(focusedThread)
          : undefined,
        selectedThreadIds: [...selection.selectedIds],
      });
      if (!ids.length) return;
      const hadSelection = selection.hasSelection;
      const queuedThreadKeys = await action(ids);
      if (!queuedThreadKeys.length) return;
      if (
        removeFromList &&
        openThreadKey &&
        queuedThreadKeys.includes(openThreadKey)
      ) {
        if (autoAdvanceReader) {
          const nextThread = getNextThreadAfterRemoval({
            threadIds: orderedIds,
            currentThreadId: openThreadKey,
            currentThreadIndex: focusedIndex,
            removedThreadIds: queuedThreadKeys,
          });
          setFocusedIndex(nextThread?.index ?? 0);
          const nextRow = threads.find(
            (thread) => getListThreadKey(thread) === nextThread?.id,
          );
          setOpenThread(
            nextRow ? getListThreadSelection(nextRow, emailAccountId) : null,
          );
        } else {
          setOpenThread(null);
        }
      }
      selection.clear();
      if (hadSelection && queuedThreadKeys.length < ids.length) {
        const queued = new Set(queuedThreadKeys);
        for (const id of ids) {
          if (queued.has(id)) continue;
          const index = orderedIds.indexOf(id);
          if (index >= 0) selection.toggle(index);
        }
      }
    },
    [
      focusedThread,
      focusedIndex,
      openThreadKey,
      orderedIds,
      selection,
      setOpenThread,
      threads,
      emailAccountId,
    ],
  );

  const openAt = useCallback(
    (index: number) => {
      const thread = threads[index];
      if (!thread) return;
      setFocusedIndex(index);
      setReplyToMessageId(undefined);
      selection.clear();
      setOpenThread(getListThreadSelection(thread, emailAccountId));
    },
    [emailAccountId, selection.clear, setOpenThread, threads],
  );

  const move = useCallback(
    (delta: number) => {
      const next = clampIndex(clampedIndex + delta);
      setFocusedIndex(next);
      // Once a reader is open, navigation keeps its content and position in
      // step. A closed list view still lets J/K move the row cursor alone —
      // there the cursor still signals intent, so warm the row for Enter.
      const nextThread = threads[next];
      if ((layout === "split" || openThreadId) && nextThread) {
        setReplyToMessageId(undefined);
        setOpenThread(getListThreadSelection(nextThread, emailAccountId));
      }
    },
    [
      clampIndex,
      clampedIndex,
      threads,
      layout,
      openThreadId,
      setOpenThread,
      emailAccountId,
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
  useEffect(() => {
    if (!openReaderThreadKey) {
      readAttemptedForOpenThread.current = null;
      return;
    }
    if (
      !openThreadKey ||
      !readerSelectionSettled ||
      !openMessages.length ||
      readAttemptedForOpenThread.current === openThreadKey
    ) {
      return;
    }
    if (!isOpenThreadUnread) {
      readAttemptedForOpenThread.current = openThreadKey;
      return;
    }

    // Remember the durable attempt so this reader doesn't queue duplicates
    // while the outbox is waiting for connectivity or provider recovery.
    readAttemptedForOpenThread.current = openThreadKey;
    markRead([openThreadKey]);
  }, [
    isOpenThreadUnread,
    markRead,
    openMessages.length,
    openReaderThreadKey,
    openThreadKey,
    readerSelectionSettled,
  ]);
  const archiveTargets = useCallback(
    () => runOn(archive, true, true),
    [archive, runOn],
  );
  const trashTargets = useCallback(() => runOn(trash, true), [runOn, trash]);
  const markSpamTargets = useCallback(
    () => runOn(markSpam, true),
    [markSpam, runOn],
  );
  const markReadTargets = useCallback(
    () => runOn(markRead, false),
    [markRead, runOn],
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
      actions: {
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

  const closeReader = () => {
    setIsFocusMode(false);
    setOpenThread(null);
  };

  // Not memoised: `useShortcuts` keeps handlers in a ref and only re-registers
  // when the set of handled ids changes, so a stable identity buys nothing.
  const handlers: ShortcutHandlers = (() => {
    if (sidePanelThreadId) return {};
    return {
      next: () => move(1),
      previous: () => move(-1),
      open: openThreadId ? requestReaderReply : () => openAt(clampedIndex),
      backToList: isMailOverlayOpen
        ? undefined
        : () => {
            if (isFocusMode) setIsFocusMode(false);
            else if (selection.hasSelection) selection.clear();
            else if (layout === "list") closeReader();
          },
      nextSplit: () => {
        const index = splits.findIndex(
          (split) => split.id === displayedActiveSplitId,
        );
        const next = splits[(index + 1) % splits.length];
        if (next) setActiveSplitId(next.id);
      },
      select: () => selection.toggle(clampedIndex),
      selectAll: selection.selectAll,
      // The cursor travels with the extension; without that, every repeat
      // re-extends from the same row and the range never grows.
      extendSelectionDown: () => extendSelection(1),
      extendSelectionUp: () => extendSelection(-1),
      archive: archiveTargets,
      delete: trashTargets,
      reply: () => {
        if (!openThreadId && focusedThread) {
          setOpenThread(getListThreadSelection(focusedThread, emailAccountId));
        }
        setReplyToMessageId(openMessages.at(-1)?.id);
      },
      moreActions: openThreadId
        ? () => setIsMenuOpen((open) => !open)
        : undefined,
      undo: () => undo(),
      toggleLayout: isAllAccounts ? undefined : toggleLayout,
      focusMode: openThreadId ? () => setIsFocusMode((on) => !on) : undefined,
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

  const onCreateSplitFromPrompt = useCallback(
    async (prompt: string) => {
      const result = await createMailSplitFromPromptAction(emailAccountId, {
        prompt,
        options: newSplitOptions.map(({ id, name, kind, value }) => ({
          id,
          name,
          kind,
          value,
        })),
      });
      if (result?.serverError || result?.validationErrors) {
        toast.error(getActionErrorMessage(result));
        return false;
      }
      await mutateSettings();
      // Jump to the new tab so the user immediately sees what the AI matched.
      const split = result?.data?.split;
      if (split) setActiveSplitId(split.id);
      return true;
    },
    [emailAccountId, newSplitOptions, mutateSettings, setActiveSplitId],
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

  const onSetDefaultSplits = useCallback(
    async (enabled: boolean) => {
      const result = await setDefaultMailSplitsAction(emailAccountId, {
        enabled,
      });
      if (result?.serverError || result?.validationErrors) {
        toast.error(getActionErrorMessage(result));
        return false;
      }
      await mutateSettings();
      if (
        !enabled &&
        savedDefaultSplits.some(
          (split) => split.id === activeSplitIdRef.current,
        )
      ) {
        setActiveSplitId("all");
      }
      return true;
    },
    [emailAccountId, mutateSettings, savedDefaultSplits, setActiveSplitId],
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

      const isActive =
        item.kind === "folder"
          ? scopeFolderId === item.id
          : scopeLabelId === item.id;
      const deletedActiveSplit =
        item.kind === "label" &&
        settings?.splits?.some(
          (split) =>
            split.id === activeSplitId &&
            split.kind === MailSplitKind.LABEL &&
            split.value === item.id,
        );
      if (isActive) {
        await Promise.all([
          setOpenThread(null),
          setScopeType("inbox"),
          item.kind === "folder"
            ? setScopeFolderId(null)
            : setScopeLabelId(null),
        ]);
      }
      if (deletedActiveSplit) setActiveSplitId("all");
      await Promise.all([
        item.kind === "folder" ? mutateFolders() : mutateLabels(),
        mutateCounts(),
        item.kind === "label" ? mutateSettings() : undefined,
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
      mutateSettings,
      activeSplitId,
      scopeFolderId,
      scopeLabelId,
      setActiveSplitId,
      setOpenThread,
      setScopeFolderId,
      setScopeLabelId,
      setScopeType,
      settings?.splits,
      terminology.label.singularCapitalized,
    ],
  );

  const onRemoveLabel = useCallback(
    async (labelId: string) => {
      if (!openThreadSelection) return;
      const result = await removeThreadLabelAction(
        openThreadSelection.emailAccountId,
        {
          threadId: openThreadSelection.threadId,
          labelId,
        },
      );
      if (result?.serverError || result?.validationErrors) {
        toast.error(getActionErrorMessage(result));
        return;
      }
      refetchOpenThread();
    },
    [openThreadSelection, refetchOpenThread],
  );

  const showList = !isFocusMode && (layout === "split" || !openThreadSelection);
  const showReader = layout === "split" || Boolean(openThreadSelection);
  const readerEmailAccount = openThreadSelection
    ? openThreadSelection.emailAccountId === emailAccountId
      ? emailAccount
      : accountsData?.emailAccounts.find(
          (account) => account.id === openThreadSelection.emailAccountId,
        )
    : emailAccount;
  const readerUserLabels = isAllAccounts
    ? (labelsByAccount[openThreadSelection?.emailAccountId ?? ""] ?? NO_LABELS)
    : userLabels;

  const selectAllAccounts = useCallback(() => {
    selection.clear();
    setFocusedIndex(0);
    setOpenThread(null);
    setScopeType(null);
    setScopeLabelId(null);
    setScopeFolderId(null);
    setSearchParam(null);
    if (
      !BUILT_IN_SPLITS.some((split) => split.id === activeSplitId) &&
      !combinedLabelSplits.some((split) => split.id === activeSplitId)
    ) {
      setActiveSplitId("all");
    }
    setAccountScope("all");
  }, [
    activeSplitId,
    combinedLabelSplits,
    selection.clear,
    setAccountScope,
    setActiveSplitId,
    setOpenThread,
    setScopeFolderId,
    setScopeLabelId,
    setScopeType,
    setSearchParam,
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
              collapsibleCategories={!isOutlook}
              labelsHeading={terminology.label.pluralCapitalized}
              labelSingular={terminology.label.singular}
              backToAppHref={prefixPath(emailAccountId, "/automation")}
              onCompose={openCompose}
              onCreateLabel={onCreateLabel}
              onEditMailboxItem={onEditMailboxItem}
              onDeleteMailboxItem={onDeleteMailboxItem}
              onOpenShortcuts={openShortcuts}
              labelEditMode={isOutlook ? "color" : "name-and-color"}
              labelColorOptions={
                isOutlook ? OUTLOOK_LABEL_COLOR_OPTIONS : GMAIL_LABEL_COLORS
              }
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
              searchQuery={searchQuery ?? ""}
              onSearch={isAllAccounts ? undefined : setSearch}
              onOpenSearch={() => setPaletteOpen(true)}
              onToggleLayout={toggleLayout}
              onToggleAssistant={() => toggleSidebar(["chat-sidebar"])}
              showSidebarToggle={!isMailSidebarOpen}
              showLayoutToggle={!isAllAccounts}
            />
            {!isScoped && !searchQuery && (
              <SplitTabs
                splits={splits}
                activeSplitId={displayedActiveSplitId}
                onSelect={setActiveSplitId}
                onDelete={onDeleteSplit}
                newSplitOptions={newSplitOptions}
                onCreateSplit={onCreateSplit}
                onCreateSplitFromPrompt={onCreateSplitFromPrompt}
                canAddDefaultSplits={canAddDefaultSplits}
                canRemoveDefaultSplits={canRemoveDefaultSplits}
                onSetDefaultSplits={onSetDefaultSplits}
                canCreateSplits={!isAllAccounts}
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
                onArchiveSelected={archiveTargets}
                onDeleteSelected={trashTargets}
                onClearSelection={selection.clear}
                showLoadMore={hasMore}
                isLoadingMore={isLoadingMore}
                onLoadMore={loadMore}
                listKey={
                  isAllAccounts
                    ? `all-accounts:${displayedActiveSplitId}`
                    : JSON.stringify(query)
                }
              />
            </LoadingContent>
          </section>
        )}

        {showReader && (!openThreadSelection || readerEmailAccount) ? (
          <EmailAccountScopeProvider emailAccount={readerEmailAccount}>
            <ThreadReader
              key={openReaderThreadKey ?? "empty"}
              thread={openThread ?? null}
              threadId={openThreadId}
              detailSelectionSettled={readerSelectionSettled}
              loading={
                Boolean(openThreadSelection) &&
                (!readerSelectionSettled || isOpenThreadLoading)
              }
              error={readerSelectionSettled ? openThreadError : undefined}
              messages={openMessages}
              userLabels={readerUserLabels}
              layout={layout}
              isFocusMode={isFocusMode}
              labelHref={labelHref}
              onRemoveLabel={onRemoveLabel}
              onBackToInbox={closeReader}
              onArchive={archiveTargets}
              onToggleFocusMode={() => setIsFocusMode((on) => !on)}
              showSidebarToggle={!isMailSidebarOpen}
              refetch={refetchOpenThread}
              autoOpenReplyForMessageId={replyToMessageId}
              menu={
                <ThreadActionsMenu
                  plans={openThread?.plans ?? []}
                  message={openMessages.at(-1) ?? null}
                  setChatInput={setChatInput}
                  isUnread={isOpenThreadUnread}
                  onMarkSpam={markSpamTargets}
                  onDelete={trashTargets}
                  onToggleRead={() => {
                    if (!openThreadKey) return;
                    setReadState([openThreadKey], isOpenThreadUnread);
                  }}
                  showFixWithChat={
                    !isAllAccounts ||
                    openThreadSelection?.emailAccountId === emailAccountId
                  }
                  open={isMenuOpen}
                  onOpenChange={setIsMenuOpen}
                />
              }
            />
          </EmailAccountScopeProvider>
        ) : null}

        {showReader && openThreadSelection && !readerEmailAccount ? (
          <div
            aria-label="Loading account"
            className="flex min-h-0 min-w-0 flex-1 items-center justify-center text-muted-foreground text-sm"
            role="status"
          >
            Loading account…
          </div>
        ) : null}
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
