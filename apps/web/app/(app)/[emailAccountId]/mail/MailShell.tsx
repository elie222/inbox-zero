"use client";

import { GmailLabel } from "@/utils/gmail/label";
import { isThreadStarred } from "@/app/(app)/[emailAccountId]/mail/star-state";
import {
  type CSSProperties,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
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
import { MailSidebarResizeHandle } from "@/app/(app)/[emailAccountId]/mail/MailSidebarResizeHandle";
import {
  MAIL_SIDEBAR_DEFAULT_WIDTH,
  MAIL_SIDEBAR_RAIL_WIDTH,
} from "@/app/(app)/[emailAccountId]/mail/sidebar-width";
import { ListSenderCommands } from "@/app/(app)/[emailAccountId]/mail/ListSenderCommands";
import { ThreadActionsMenu } from "@/app/(app)/[emailAccountId]/mail/ThreadActionsMenu";
import { ShortcutsDialog } from "@/app/(app)/[emailAccountId]/mail/ShortcutsDialog";
import { SplitTabs } from "@/app/(app)/[emailAccountId]/mail/SplitTabs";
import {
  NewSplitDialog,
  type ExistingSplit,
} from "@/app/(app)/[emailAccountId]/mail/NewSplitDialog";
import type { MailSplitFilterDraft } from "@/utils/mail/split-filters";
import { extractEmailAddress } from "@/utils/email";
import { LabelPickerDialog } from "@/app/(app)/[emailAccountId]/mail/LabelPickerDialog";
import { ThreadList } from "@/app/(app)/[emailAccountId]/mail/ThreadList";
import { ThreadReader } from "@/app/(app)/[emailAccountId]/mail/ThreadReader";
import {
  getActiveThreadIndex,
  getNextThreadAfterRemoval,
  resolveThreadActionTargets,
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
import { requestMailboxSync } from "@/app/(app)/[emailAccountId]/mail/use-mailbox-sync";
import { useThreadActions } from "@/app/(app)/[emailAccountId]/mail/use-thread-actions";
import { useThreadSelection } from "@/app/(app)/[emailAccountId]/mail/use-thread-selection";
import { isThreadUnread } from "@/app/(app)/[emailAccountId]/mail/read-state";
import { getInboxUnreadDelta } from "@/app/(app)/[emailAccountId]/mail/inbox-unread-count";
import { MailLayout, MailSplitFilterKind } from "@/generated/prisma/enums";
import { useChat } from "@/providers/ChatProvider";
import { Sidebar, useSidebar } from "@/components/ui/sidebar";
import { useAtomValue, useSetAtom } from "jotai";
import {
  commandPaletteOpenAtom,
  mailCommandContextAtom,
  senderCommandContextAtom,
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
  buildMailSplitFromPromptAction,
  createMailSplitAction,
  deleteMailSplitAction,
  updateMailSplitAction,
  updateMailPreferencesAction,
} from "@/utils/actions/mail-split";
import type { UpdateMailPreferencesBody } from "@/utils/actions/mail-split.validation";
import {
  createLabelAction,
  deleteMailboxItemAction,
  removeThreadLabelAction,
  updateMailboxItemAction,
} from "@/utils/actions/mail";
import {
  getPortableLabelSplits,
  OTHER_SPLIT_ID,
  otherMailSplitQuery,
  mailSplitToThreadsQuery,
  mailTypeToThreadsQuery,
} from "@/utils/mail/split-query";
import { getActionErrorMessage } from "@/utils/error";
import { prefixPath } from "@/utils/path";
import { getMailAccountUrl } from "@/app/(app)/[emailAccountId]/mail/mail-account-url";
import { redirectToSafeUrl } from "@/utils/redirect";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";
import { LoadingContent } from "@/components/LoadingContent";
import { getEmailMessageCellActions } from "@/components/EmailMessageCellActions";
import type { LabelCount } from "@/app/api/labels/counts/route";
import type { ThreadsQuery } from "@/utils/threads/validation";
import { getEmailTerminology } from "@/utils/terminology";
import { GMAIL_LABEL_COLORS } from "@/utils/gmail/label-colors";
import { OUTLOOK_CATEGORY_COLORS } from "@/utils/outlook/category-colors";

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
  const {
    adjustInboxUnread,
    countsById,
    mutate: mutateCounts,
  } = useLabelCounts({ emailAccountId });
  const { data: settings, mutate: mutateSettings } = useMailSettings();
  const { onOpen: openCompose } = useComposeModal();
  const { setInput: setChatInput } = useChat();
  const { state: openSidebars, toggleSidebar } = useSidebar();
  const isPaletteOpen = useAtomValue(commandPaletteOpenAtom);
  const senderCommandContext = useAtomValue(senderCommandContextAtom);
  const [isNewSplitOpen, setIsNewSplitOpen] = useState(false);
  const [editingSplitId, setEditingSplitId] = useState<string | null>(null);
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
  const [activeSplitId, setActiveSplitId] = useQueryState("split");
  const activeSplitIdRef = useRef(activeSplitId);
  activeSplitIdRef.current = activeSplitId;
  const [accountScope, setAccountScope] = useQueryState("accountScope");
  const [scopeType, setScopeType] = useQueryState("type");
  const [scopeLabelId, setScopeLabelId] = useQueryState("labelId");
  const [scopeFolderId, setScopeFolderId] = useQueryState("folderId");
  const [searchParam, setSearchParam] = useQueryState("q");

  const [focusedIndex, setFocusedIndex] = useState(0);
  const [isDesktopApp, setIsDesktopApp] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [labelPicker, setLabelPicker] = useState<{
    mode: "label" | "move";
    targets: ThreadSelection[];
  } | null>(null);
  const [replyToMessageId, setReplyToMessageId] = useState<string>();
  const [forwardToMessageId, setForwardToMessageId] = useState<string>();
  const pendingComposeRequest = useRef<{
    mode: "reply" | "forward";
    threadKey: string;
  } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pendingSearchFocusRef = useRef(false);
  const isMailSidebarOpen = openSidebars.includes("left-sidebar");

  // Dragging writes straight to the CSS variable: re-rendering this screen on
  // every pointer move would make the sidebar edge lag behind the cursor.
  const sidebarScopeRef = useRef<HTMLDivElement>(null);
  const setSidebarWidth = useCallback((width: number) => {
    sidebarScopeRef.current?.style.setProperty("--sidebar-width", `${width}px`);
  }, []);

  useEffect(() => {
    setIsDesktopApp(Boolean(getInboxZeroDesktopApp()));
  }, []);

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
  const expandedPreview = settings?.expandedPreview ?? false;

  // Written through the SWR cache rather than mirrored in local state, so the
  // preference has one source of truth and every reader sees the new value.
  const updatePreferences = useCallback(
    (preferences: UpdateMailPreferencesBody) => {
      if (!settings) return;
      const loadedSettings = settings;

      mutateSettings(
        async (current) => {
          const result = await updateMailPreferencesAction(
            emailAccountId,
            preferences,
          );
          // Thrown so SWR rolls the optimistic value back rather than leaving
          // the UI showing a preference the server never accepted.
          if (result?.serverError || result?.validationErrors)
            throw new Error(getActionErrorMessage(result));
          return { ...(current ?? loadedSettings), ...preferences };
        },
        {
          optimisticData: (current) => ({
            ...(current ?? loadedSettings),
            ...preferences,
          }),
          revalidate: false,
          rollbackOnError: true,
        },
      ).catch((error) => {
        toast.error(
          error instanceof Error ? error.message : "Couldn't save that",
        );
      });
    },
    [emailAccountId, mutateSettings, settings],
  );

  const toggleLayout = useCallback(
    () =>
      updatePreferences({
        layout: layout === "split" ? MailLayout.LIST : MailLayout.SPLIT,
      }),
    [layout, updatePreferences],
  );

  const togglePreview = useCallback(
    () => updatePreferences({ expandedPreview: !expandedPreview }),
    [expandedPreview, updatePreferences],
  );

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

  const searchQuery = searchParam?.trim() || null;
  const setSearch = useCallback(
    (value: string) => setSearchParam(value.trim() || null),
    [setSearchParam],
  );

  const combinedLabelSplits = useMemo(
    () => getPortableLabelSplits(settings?.splits ?? [], userLabels),
    [settings?.splits, userLabels],
  );

  const splits = useMemo(
    () =>
      [
        ...(settings?.splits ?? []).map((split) => ({
          ...split,
          name:
            isGoogle && split.name.trim().toLowerCase() === "other"
              ? `${split.name} (custom)`
              : split.name,
        })),
        ...(isGoogle && !isAllAccounts
          ? [
              {
                id: OTHER_SPLIT_ID,
                name: "Other",
                matchAll: true,
                filters: [],
              },
            ]
          : []),
      ].filter(
        (split) =>
          !isAllAccounts ||
          split.filters.every(
            (filter) => filter.kind === MailSplitFilterKind.UNREAD,
          ) ||
          combinedLabelSplits.some((portable) => portable.id === split.id),
      ),
    [settings?.splits, isAllAccounts, combinedLabelSplits, isGoogle],
  );
  const activeSplit =
    splits.find((split) => split.id === activeSplitId) ?? splits[0];
  const displayedActiveSplitId = activeSplit?.id ?? null;
  const activeCombinedLabelNames = combinedLabelSplits.find(
    (split) => split.id === displayedActiveSplitId,
  )?.labelNames;
  const query: ThreadsQuery = useMemo(() => {
    // Search overrides split/scope and covers the whole mailbox, matching
    // what Gmail's and Outlook's own search boxes do by default.
    if (searchQuery) return { q: searchQuery };
    if (scopeQuery) return scopeQuery;

    if (activeSplit?.id === OTHER_SPLIT_ID) return otherMailSplitQuery(splits);
    return activeSplit
      ? mailSplitToThreadsQuery(activeSplit)
      : { type: "inbox" };
  }, [searchQuery, scopeQuery, activeSplit, splits]);

  const accountThreadState = useMailThreads({
    emailAccountId,
    query,
    enabled: !isAllAccounts,
  });
  const combinedThreadState = useCombinedMailThreads({
    accounts: combinedAccounts,
    emailAccountId,
    enabled: isAllAccounts,
    isUnread:
      !searchQuery &&
      !!activeSplit?.filters.length &&
      activeSplit.filters.every(
        (filter) => filter.kind === MailSplitFilterKind.UNREAD,
      ),
    labelNames: searchQuery ? undefined : activeCombinedLabelNames,
    searchQuery: searchQuery ?? undefined,
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
  const readerEmailAccount = openThreadSelection
    ? openThreadSelection.emailAccountId === emailAccountId
      ? emailAccount
      : accountsData?.emailAccounts.find(
          (account) => account.id === openThreadSelection.emailAccountId,
        )
    : emailAccount;
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
  const openExternalUrl = useMemo(() => {
    const message = openMessages.at(-1);
    if (!message || !readerEmailAccount) return;
    return getEmailMessageCellActions({
      externalUrl: message.externalUrl,
      messageId: message.id,
      provider: readerEmailAccount.account.provider,
      threadId: message.threadId,
      userEmail: readerEmailAccount.email,
    })?.openUrl;
  }, [openMessages, readerEmailAccount]);
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
  const actionTargets = useMemo(() => {
    const listTargets = threads.map((thread) => ({
      key: getListThreadKey(thread),
      messages: thread.messages,
      selection: getListThreadSelection(thread, emailAccountId),
    }));
    const openTarget =
      openThreadKey && openThreadSelection && (openThread || readerTarget)
        ? {
            key: openThreadKey,
            messages: openThread?.messages ?? openMessages,
            selection: openThreadSelection,
          }
        : undefined;

    return resolveThreadActionTargets({
      focusedKey: focusedThread ? getListThreadKey(focusedThread) : undefined,
      listTargets,
      openTarget,
      selectedKeys: [...selection.selectedIds],
    });
  }, [
    emailAccountId,
    focusedThread,
    openMessages,
    openThread,
    openThreadKey,
    openThreadSelection,
    readerTarget,
    selection.selectedIds,
    threads,
  ]);
  const {
    archive,
    trash,
    markSpam,
    setReadState: queueReadState,
    setStarredState,
    snooze,
    undo,
  } = useThreadActions({
    emailAccountId,
    readerTarget,
    threads,
  });
  const inboxFolderId = folders.find(
    (folder) => folder.systemType === "INBOX",
  )?.id;
  // Behind a ref so setReadState stays referentially stable across thread-list
  // refreshes, matching useThreadActions.
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const setReadState = useCallback(
    async (threadKeys: string[], read: boolean, notifySuccess = true) => {
      const threadsBeforeQueue = threadsRef.current;
      const queuedKeys = await queueReadState(threadKeys, read, notifySuccess);
      if (!isAllAccounts) {
        adjustInboxUnread(
          getInboxUnreadDelta({
            countByMessage: isOutlook,
            inboxFolderId,
            read,
            threadKeys: queuedKeys,
            threads: threadsBeforeQueue,
          }),
        );
      }
      return queuedKeys;
    },
    [
      adjustInboxUnread,
      inboxFolderId,
      isAllAccounts,
      isOutlook,
      queueReadState,
    ],
  );
  const markRead = useCallback(
    (threadKeys: string[]) => setReadState(threadKeys, true, false),
    [setReadState],
  );
  const requestReaderReply = useCallback(() => {
    const messageId = openMessages.at(-1)?.id;
    if (messageId) {
      pendingComposeRequest.current = null;
      setForwardToMessageId(undefined);
      setReplyToMessageId(messageId);
      return;
    }

    if (openReaderThreadKey) {
      pendingComposeRequest.current = {
        mode: "reply",
        threadKey: openReaderThreadKey,
      };
    }
  }, [openMessages, openReaderThreadKey]);

  const requestReaderForward = useCallback(() => {
    const messageId = openMessages.at(-1)?.id;
    if (messageId) {
      pendingComposeRequest.current = null;
      setReplyToMessageId(undefined);
      setForwardToMessageId(messageId);
      return;
    }

    if (openReaderThreadKey) {
      pendingComposeRequest.current = {
        mode: "forward",
        threadKey: openReaderThreadKey,
      };
    }
  }, [openMessages, openReaderThreadKey]);

  useEffect(() => {
    const pendingRequest = pendingComposeRequest.current;
    if (!pendingRequest) return;
    if (pendingRequest.threadKey !== openReaderThreadKey) {
      pendingComposeRequest.current = null;
      return;
    }

    const messageId = openMessages.at(-1)?.id;
    if (!readerSelectionSettled || !messageId) return;

    pendingComposeRequest.current = null;
    if (pendingRequest.mode === "reply") {
      setForwardToMessageId(undefined);
      setReplyToMessageId(messageId);
    } else {
      setReplyToMessageId(undefined);
      setForwardToMessageId(messageId);
    }
  }, [openMessages, openReaderThreadKey, readerSelectionSettled]);

  // Let the fetched snapshot decide the initial read state. Once marking has
  // been attempted, the optimistically patched row is the copy that stays in
  // step while the fetched snapshot may still be stale.
  const initialReadStateMessages = openMessages.length
    ? openMessages
    : (openThread?.messages ?? openMessages);
  const readStateMessages =
    readAttemptedForOpenThread.current === openThreadKey
      ? (openThread?.messages ?? openMessages)
      : initialReadStateMessages;
  const isOpenThreadUnread = isThreadUnread(readStateMessages);

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
      const ids = actionTargets.map((target) => target.key);
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
      actionTargets,
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
      setForwardToMessageId(undefined);
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
        setForwardToMessageId(undefined);
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
      // A cached read snapshot can arrive before a fresh unread response.
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
    () => runOn((ids) => setReadState(ids, false), true),
    [runOn, setReadState],
  );
  const allStarred =
    actionTargets.length > 0 &&
    actionTargets.every((target) => isThreadStarred(target.messages));
  const starTargets = useCallback(
    () => runOn((ids) => setStarredState(ids, !allStarred), false),
    [runOn, setStarredState, allStarred],
  );
  const snoozeTargets = useCallback(
    (until: Date) => runOn((ids) => snooze(ids, until), true),
    [runOn, snooze],
  );
  const currentLabelTargets = useMemo(
    () => actionTargets.map((target) => target.selection),
    [actionTargets],
  );
  const labelAccountId = currentLabelTargets[0]?.emailAccountId;
  const labelAccount =
    labelAccountId === emailAccountId
      ? emailAccount
      : accountsData?.emailAccounts.find(
          (account) => account.id === labelAccountId,
        );
  const canLabel =
    currentLabelTargets.length > 0 &&
    isGoogleProvider(labelAccount?.account.provider) &&
    currentLabelTargets.every(
      (target) => target.emailAccountId === labelAccountId,
    );
  const openLabelPicker = useCallback(() => {
    if (canLabel)
      setLabelPicker({ mode: "label", targets: currentLabelTargets });
  }, [canLabel, currentLabelTargets]);
  const openMovePicker = useCallback(() => {
    if (canLabel)
      setLabelPicker({ mode: "move", targets: currentLabelTargets });
  }, [canLabel, currentLabelTargets]);
  const singleActionTarget =
    actionTargets.length === 1 ? actionTargets.at(0) : undefined;
  const requestForwardTarget = useCallback(() => {
    if (!singleActionTarget) return;
    if (singleActionTarget.key === openThreadKey) {
      requestReaderForward();
      return;
    }

    const targetIndex = threads.findIndex(
      (thread) => getListThreadKey(thread) === singleActionTarget.key,
    );
    const targetThreadKey = getThreadSelectionKey(singleActionTarget.selection);
    if (!targetThreadKey) return;
    pendingComposeRequest.current = {
      mode: "forward",
      threadKey: targetThreadKey,
    };
    if (targetIndex >= 0) setFocusedIndex(targetIndex);
    setReplyToMessageId(undefined);
    setForwardToMessageId(undefined);
    setOpenThread(singleActionTarget.selection);
  }, [
    openThreadKey,
    requestReaderForward,
    setOpenThread,
    singleActionTarget,
    threads,
  ]);
  const pickerAccount =
    labelPicker?.targets[0]?.emailAccountId === emailAccountId
      ? emailAccount
      : accountsData?.emailAccounts.find(
          (account) => account.id === labelPicker?.targets[0]?.emailAccountId,
        );
  const senderAccount =
    singleActionTarget?.selection.emailAccountId === emailAccountId
      ? emailAccount
      : accountsData?.emailAccounts.find(
          (account) =>
            account.id === singleActionTarget?.selection.emailAccountId,
        );
  const isReaderTarget =
    singleActionTarget !== undefined &&
    singleActionTarget.key === openThreadKey;

  const mailCommandContext = useMemo(
    () => ({
      actions: {
        archive: archiveTargets,
        forward: singleActionTarget ? requestForwardTarget : undefined,
        label: canLabel ? openLabelPicker : undefined,
        star: starTargets,
        markRead: markReadTargets,
        markSpam: markSpamTargets,
        markUnread: markUnreadTargets,
        move: canLabel ? openMovePicker : undefined,
        openExternal:
          isReaderTarget && openExternalUrl
            ? () =>
                window.open(openExternalUrl, "_blank", "noopener,noreferrer")
            : undefined,
        snooze: snoozeTargets,
        trash: trashTargets,
      },
      allStarred,
      hasRead: actionTargets.some((target) => !isThreadUnread(target.messages)),
      hasUnread: actionTargets.some((target) =>
        isThreadUnread(target.messages),
      ),
      openExternalLabel:
        isReaderTarget && openExternalUrl
          ? `Open in ${isMicrosoftProvider(readerEmailAccount?.account.provider) ? "Outlook" : "Gmail"}`
          : undefined,
      target: singleActionTarget
        ? {
            emailAccountId: singleActionTarget.selection.emailAccountId,
            threadId: singleActionTarget.selection.threadId,
          }
        : undefined,
      targetCount: actionTargets.length,
    }),
    [
      archiveTargets,
      actionTargets,
      canLabel,
      isReaderTarget,
      allStarred,
      starTargets,
      markReadTargets,
      markSpamTargets,
      markUnreadTargets,
      openLabelPicker,
      openMovePicker,
      openExternalUrl,
      readerEmailAccount?.account.provider,
      requestForwardTarget,
      singleActionTarget,
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
    isHelpOpen ||
    isPaletteOpen ||
    Boolean(labelPicker) ||
    (isMenuOpen && Boolean(openThreadId));

  const selectAccount = useCallback((accountId: string) => {
    redirectToSafeUrl(getMailAccountUrl(accountId, window.location.search));
  }, []);

  const selectAllAccounts = useCallback(() => {
    selection.clear();
    setFocusedIndex(0);
    setOpenThread(null);
    setScopeType(null);
    setScopeLabelId(null);
    setScopeFolderId(null);
    setSearchParam(null);
    if (
      !settings?.splits.some(
        (split) =>
          split.id === activeSplitId &&
          split.filters.every(
            (filter) => filter.kind === MailSplitFilterKind.UNREAD,
          ),
      ) &&
      !combinedLabelSplits.some((split) => split.id === activeSplitId)
    ) {
      setActiveSplitId(null);
    }
    setAccountScope("all");
  }, [
    activeSplitId,
    settings?.splits,
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

  const closeReader = () => {
    setOpenThread(null);
  };

  const senderCommands =
    senderCommandContext?.emailAccountId ===
      singleActionTarget?.selection.emailAccountId &&
    senderCommandContext?.threadId === singleActionTarget?.selection.threadId
      ? senderCommandContext
      : null;
  // `useShortcuts` keeps handlers in a ref, so these need no memoization.
  const handlers: ShortcutHandlers = (() => {
    if (sidePanelThreadId || labelPicker) return {};
    return {
      unsubscribe:
        !isMailOverlayOpen && !senderCommands?.isUnsubscribeDisabled
          ? senderCommands?.unsubscribe
          : undefined,
      toggleAutoArchive:
        !isMailOverlayOpen && !senderCommands?.isAutoArchiveDisabled
          ? senderCommands?.toggleAutoArchive
          : undefined,
      next: (event) => {
        if (openThreadId && event?.key === "ArrowDown") return;
        move(1);
      },
      previous: (event) => {
        if (openThreadId && event?.key === "ArrowUp") return;
        move(-1);
      },
      open: openThreadId
        ? (event) => {
            if (
              event?.target instanceof Element &&
              event.target.closest("[data-thread-message-id]")
            )
              return;
            requestReaderReply();
          }
        : () => openAt(clampedIndex),
      backToList: isMailOverlayOpen
        ? undefined
        : () => {
            if (selection.hasSelection) selection.clear();
            else if (layout === "list") closeReader();
          },
      nextSplit: () => {
        const index = splits.findIndex(
          (split) => split.id === displayedActiveSplitId,
        );
        const next = splits[(index + 1) % splits.length];
        if (next) setActiveSplitId(next.id);
      },
      switchAccount: (event) => {
        const accountNumber = Number(event?.key);
        if (
          !Number.isInteger(accountNumber) ||
          accountNumber < 1 ||
          accountNumber > 9
        )
          return;
        const account = accountsData?.emailAccounts.at(accountNumber - 1);
        if (account && (isAllAccounts || account.id !== emailAccountId)) {
          selectAccount(account.id);
        }
      },
      switchAllAccounts: selectAllAccounts,
      select: () => selection.toggle(clampedIndex),
      selectAll: selection.selectAll,
      // The cursor travels with the extension; without that, every repeat
      // re-extends from the same row and the range never grows.
      extendSelectionDown: () => extendSelection(1),
      extendSelectionUp: () => extendSelection(-1),
      label: canLabel ? openLabelPicker : undefined,
      move: canLabel ? openMovePicker : undefined,
      archive: archiveTargets,
      star: starTargets,
      markSpam: markSpamTargets,
      markUnread: markUnreadTargets,
      delete: trashTargets,
      reply: () => {
        setForwardToMessageId(undefined);
        if (!openThreadId && focusedThread) {
          setOpenThread(getListThreadSelection(focusedThread, emailAccountId));
        }
        setReplyToMessageId(openMessages.at(-1)?.id);
      },
      forward: singleActionTarget ? requestForwardTarget : undefined,
      moreActions: openThreadId
        ? () => setIsMenuOpen((open) => !open)
        : undefined,
      openExternal:
        isReaderTarget && openExternalUrl
          ? () => window.open(openExternalUrl, "_blank", "noopener,noreferrer")
          : undefined,
      undo: () => undo(),
      toggleLayout: isAllAccounts ? undefined : toggleLayout,
      togglePreview,
      help: () => setIsHelpOpen(true),
      search: isMailOverlayOpen
        ? undefined
        : () => {
            if (selection.hasSelection) selection.clear();
            if (layout === "list" && openThreadId) closeReader();
            pendingSearchFocusRef.current = true;
            const input = searchInputRef.current;
            if (input) {
              pendingSearchFocusRef.current = false;
              input.focus();
              input.select();
            }
          },
    };
  })();

  useLayoutEffect(() => {
    // The search field remounts when selection clears or the list returns, so
    // consume a pending `/` focus after whichever commit actually rendered it.
    if (!pendingSearchFocusRef.current) return;
    const input = searchInputRef.current;
    if (!input) return;
    pendingSearchFocusRef.current = false;
    input.focus();
    input.select();
  });

  useShortcuts(handlers, { isDesktopApp });

  const splitLabelChoices = useMemo(
    () =>
      [
        ...visibleLabels,
        ...(isGoogle ? [{ id: GmailLabel.IMPORTANT, name: "Important" }] : []),
      ].map((label) => ({
        id: `label:${label.id}`,
        name: label.name,
        value: label.id,
      })),
    [visibleLabels, isGoogle],
  );
  const splitCategoryChoices = useMemo(
    () =>
      categories.map((category) => ({
        id: `category:${category.type}`,
        name: category.name,
        value: category.type,
      })),
    [categories],
  );
  // Senders the reader actually corresponds with, so "Describe it" can turn a
  // person's name into an address instead of guessing a domain.
  const splitSenders = useMemo(() => {
    const seen = new Set<string>();
    for (const thread of threads) {
      const from = thread.messages.at(-1)?.headers.from;
      const address = from ? extractEmailAddress(from) : null;
      if (address && address !== userEmail) seen.add(address);
      if (seen.size >= 50) break;
    }
    return [...seen];
  }, [threads, userEmail]);

  const editingSplit: ExistingSplit | null = useMemo(() => {
    if (!editingSplitId) return null;
    const split = settings?.splits?.find((s) => s.id === editingSplitId);
    return split
      ? {
          id: split.id,
          name: split.name,
          matchAll: split.matchAll,
          filters: split.filters,
        }
      : null;
  }, [editingSplitId, settings?.splits]);

  const savedSplits: ExistingSplit[] = useMemo(
    () =>
      (settings?.splits ?? []).map((split) => ({
        id: split.id,
        name: split.name,
        matchAll: split.matchAll,
        filters: split.filters,
      })),
    [settings?.splits],
  );

  const onCreateSplit = useCallback(
    async (draft: {
      name: string;
      matchAll: boolean;
      filters: MailSplitFilterDraft[];
    }) => {
      const result = await createMailSplitAction(emailAccountId, draft);
      if (result?.serverError || result?.validationErrors) {
        toast.error(getActionErrorMessage(result));
        return false;
      }
      await mutateSettings();
      const split = result?.data?.split;
      if (split) setActiveSplitId(split.id);
      return true;
    },
    [emailAccountId, mutateSettings, setActiveSplitId],
  );

  const onUpdateSplit = useCallback(
    async (draft: {
      id: string;
      name: string;
      matchAll: boolean;
      filters: MailSplitFilterDraft[];
    }) => {
      const result = await updateMailSplitAction(emailAccountId, draft);
      if (result?.serverError || result?.validationErrors) {
        toast.error(getActionErrorMessage(result));
        return false;
      }
      await mutateSettings();
      return true;
    },
    [emailAccountId, mutateSettings],
  );

  const onDescribeSplit = useCallback(
    async (prompt: string) => {
      const result = await buildMailSplitFromPromptAction(emailAccountId, {
        prompt,
        options: [
          ...splitLabelChoices.map((label) => ({
            id: label.id,
            name: label.name,
            kind: "LABEL" as const,
            value: label.value,
          })),
          ...splitCategoryChoices.map((category) => ({
            id: category.id,
            name: category.name,
            kind: "CATEGORY" as const,
            value: category.value,
          })),
        ],
        senders: splitSenders,
      });
      if (result?.serverError || result?.validationErrors) {
        toast.error(getActionErrorMessage(result));
        return null;
      }
      return result?.data ?? null;
    },
    [emailAccountId, splitCategoryChoices, splitLabelChoices, splitSenders],
  );

  const onDeleteSplit = useCallback(
    async (splitId: string) => {
      const result = await deleteMailSplitAction(emailAccountId, {
        id: splitId,
      });
      if (result?.serverError || result?.validationErrors) {
        toast.error(getActionErrorMessage(result));
        return false;
      }
      if (activeSplitIdRef.current === splitId) setActiveSplitId(null);
      await mutateSettings();
      return true;
    },
    [emailAccountId, mutateSettings, setActiveSplitId],
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
            // Deleting the label removes a split defined solely by it.
            split.filters.length > 0 &&
            split.filters.every(
              (filter) =>
                filter.kind === MailSplitFilterKind.LABEL &&
                filter.value === item.id,
            ),
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
      if (deletedActiveSplit) setActiveSplitId(null);
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

  const showList = layout === "split" || !openThreadSelection;
  const showReader = layout === "split" || Boolean(openThreadSelection);
  const readerUserLabels = isAllAccounts
    ? (labelsByAccount[openThreadSelection?.emailAccountId ?? ""] ?? NO_LABELS)
    : userLabels;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex min-h-0 flex-1">
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
                  isDesktopApp={isDesktopApp}
                  isAllAccounts={isAllAccounts}
                  onSelectAccount={selectAccount}
                  onSelectAll={selectAllAccounts}
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
              onSearch={setSearch}
              searchInputRef={searchInputRef}
              onToggleLayout={toggleLayout}
              expandedPreview={expandedPreview}
              onTogglePreview={togglePreview}
              onToggleAssistant={() => toggleSidebar(["chat-sidebar"])}
              showLayoutToggle={!isAllAccounts}
              selectedCount={selection.selectedCount}
              onArchiveSelected={archiveTargets}
              onDeleteSelected={trashTargets}
              onLabelSelected={canLabel ? openLabelPicker : undefined}
              onClearSelection={selection.clear}
            />
            {!isScoped && !searchQuery && (
              <SplitTabs
                splits={splits.map((split) => ({
                  ...split,
                  deletable: split.filters.length > 0,
                }))}
                activeSplitId={displayedActiveSplitId}
                onSelect={setActiveSplitId}
                onDelete={onDeleteSplit}
                onEdit={
                  isAllAccounts
                    ? undefined
                    : (splitId) => {
                        setEditingSplitId(splitId);
                        setIsNewSplitOpen(true);
                      }
                }
                onNewSplit={() => {
                  setEditingSplitId(null);
                  setIsNewSplitOpen(true);
                }}
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
                expandedPreview={expandedPreview}
                userEmail={userEmail}
                userLabels={isAllAccounts ? NO_LABELS : userLabels}
                labelsByAccount={labelsByAccount}
                focusedIndex={clampedIndex}
                isSelected={selection.isSelected}
                selectedCount={selection.selectedCount}
                onOpenThread={openAt}
                onToggleSelect={selection.toggle}
                onSelectRangeTo={selection.selectRangeTo}
                showLoadMore={hasMore}
                isLoadingMore={isLoadingMore}
                onLoadMore={loadMore}
                listKey={
                  isAllAccounts
                    ? `all-accounts:${searchQuery ?? displayedActiveSplitId}`
                    : JSON.stringify(query)
                }
              />
            </LoadingContent>
          </section>
        )}

        {showReader && (!openThreadSelection || readerEmailAccount) ? (
          <EmailAccountScopeProvider emailAccount={readerEmailAccount}>
            <ThreadReader
              enableMessageNavigation={!sidePanelThreadId}
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
              labelHref={labelHref}
              onRemoveLabel={onRemoveLabel}
              onBackToInbox={closeReader}
              onArchive={archiveTargets}
              refetch={refetchOpenThread}
              onSendSuccess={(_messageId, sentThreadId) => {
                if (
                  !openThreadSelection ||
                  !sentThreadId.trim() ||
                  sentThreadId === openThreadSelection.threadId
                )
                  return;
                setReplyToMessageId(undefined);
                setOpenThread({
                  emailAccountId: openThreadSelection.emailAccountId,
                  threadId: sentThreadId,
                });
              }}
              autoOpenReplyForMessageId={replyToMessageId}
              autoOpenForwardForMessageId={forwardToMessageId}
              menu={
                <ThreadActionsMenu
                  plans={openThread?.plans ?? []}
                  message={openMessages.at(-1) ?? null}
                  setChatInput={setChatInput}
                  isUnread={isOpenThreadUnread}
                  onMarkSpam={markSpamTargets}
                  onDelete={trashTargets}
                  onLabel={canLabel ? openLabelPicker : undefined}
                  onMove={canLabel ? openMovePicker : undefined}
                  onMarkRead={() => {
                    if (!openThreadKey) return;
                    setReadState([openThreadKey], true);
                  }}
                  onMarkUnread={markUnreadTargets}
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
            aria-label="Loading"
            className="flex min-h-0 min-w-0 flex-1 items-center justify-center text-muted-foreground text-sm"
            role="status"
          >
            Loading…
          </div>
        ) : null}
      </div>

      <MailAccountSwitcher
        isDesktopApp={isDesktopApp}
        isAllAccounts={isAllAccounts}
        onSelectAccount={selectAccount}
        onSelectAll={selectAllAccounts}
        variant="compact"
      />

      {!isReaderTarget &&
      singleActionTarget &&
      senderAccount &&
      !sidePanelThreadId ? (
        <EmailAccountScopeProvider emailAccount={senderAccount}>
          <ListSenderCommands
            key={singleActionTarget.key}
            message={singleActionTarget.messages.at(-1) ?? null}
          />
        </EmailAccountScopeProvider>
      ) : null}
      {!isAllAccounts && (
        <NewSplitDialog
          open={isNewSplitOpen}
          onOpenChange={(open) => {
            setIsNewSplitOpen(open);
            if (!open) setEditingSplitId(null);
          }}
          labels={splitLabelChoices}
          categories={splitCategoryChoices}
          senders={splitSenders}
          existingSplits={savedSplits}
          editing={editingSplit}
          supportsStarred={!isOutlook}
          onCreate={onCreateSplit}
          onUpdate={onUpdateSplit}
          onDelete={onDeleteSplit}
          onDescribe={onDescribeSplit}
        />
      )}

      {labelPicker && pickerAccount && (
        <EmailAccountScopeProvider emailAccount={pickerAccount}>
          <LabelPickerDialog
            threadIds={labelPicker.targets.map((target) => target.threadId)}
            mode={labelPicker.mode}
            onClose={() => setLabelPicker(null)}
            onApplied={(threadIds, labelId) => {
              const keys = threadIds.map((threadId) =>
                isAllAccounts ? `${pickerAccount.id}:${threadId}` : threadId,
              );
              const updater = <
                T extends { messages: { labelIds?: string[] }[] },
              >(
                thread: T,
              ): T => ({
                ...thread,
                messages: thread.messages.map((message) => ({
                  ...message,
                  labelIds: [
                    ...new Set([
                      ...(labelPicker.mode === "move"
                        ? (message.labelIds ?? []).filter(
                            (existingLabelId) => existingLabelId !== "INBOX",
                          )
                        : (message.labelIds ?? [])),
                      labelId,
                    ]),
                  ],
                })),
              });
              const update = isAllAccounts
                ? combinedThreadState.optimisticallyUpdateThreads(keys, updater)
                : accountThreadState.optimisticallyUpdateThreads(keys, updater);
              for (const key of keys) update.commit(key);
              requestMailboxSync(pickerAccount.id);
              refetchOpenThread();
              if (labelPicker.mode === "move") {
                if (openThreadKey && keys.includes(openThreadKey)) {
                  setOpenThread(null);
                }
                selection.clear();
              } else if (isAllAccounts) combinedThreadState.refetch();
              mutateLabels();
              mutateCounts();
            }}
          />
        </EmailAccountScopeProvider>
      )}
      <ShortcutsDialog
        isDesktopApp={isDesktopApp}
        open={isHelpOpen}
        onOpenChange={setIsHelpOpen}
      />
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
