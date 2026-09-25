"use client";

import type { ListThread } from "./types";

import { MailPanelErrorBoundary } from "@/app/(app)/[emailAccountId]/mail/MailPanelErrorBoundary";
import { isThreadStarred } from "@/app/(app)/[emailAccountId]/mail/star-state";
import {
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
import { getMailSearchFolders } from "@/app/(app)/[emailAccountId]/mail/outlook-folder-list";
import { MailAccountSwitcher } from "@/app/(app)/[emailAccountId]/mail/MailAccountSwitcher";
import {
  getMailNavPath,
  MAIL_SCHEDULED_TYPE,
} from "@/app/(app)/[emailAccountId]/mail/MailSidebar";
import { MailShellSidebar } from "@/app/(app)/[emailAccountId]/mail/MailShellSidebar";
import { MailSplitTabs } from "@/app/(app)/[emailAccountId]/mail/MailSplitTabs";
import { MailReaderPane } from "@/app/(app)/[emailAccountId]/mail/MailReaderPane";
import { ScheduledEmailList } from "@/app/(app)/[emailAccountId]/mail/ScheduledEmailList";
import type { MailboxItem } from "@/app/(app)/[emailAccountId]/mail/MailboxItemContextMenu";
import { ListSenderCommands } from "@/app/(app)/[emailAccountId]/mail/ListSenderCommands";
import { extractEmailAddress } from "@/utils/email";
import { LabelPickerDialog } from "@/app/(app)/[emailAccountId]/mail/LabelPickerDialog";
import { ThreadList } from "@/app/(app)/[emailAccountId]/mail/ThreadList";
import { useStableCallback } from "@/app/(app)/[emailAccountId]/mail/use-stable-callback";
import {
  getActiveThreadIndex,
  getSearchFocus,
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
import { useThreadActions } from "@/app/(app)/[emailAccountId]/mail/use-thread-actions";
import { useOptionalMailClient } from "@inboxzero/mail-react/MailEngineProvider";
import { MailProductFrame } from "@inboxzero/mail-ui/MailProductFrame";
import { MailEngineConnectionBanner } from "@/utils/mail-engine/MailEngineConnectionBanner";
import { useThreadSelection } from "@/app/(app)/[emailAccountId]/mail/use-thread-selection";
import { useWarmNeighbourThreads } from "@/app/(app)/[emailAccountId]/mail/use-warm-neighbour-threads";
import { useMailPerformanceTelemetry } from "@/app/(app)/[emailAccountId]/mail/use-mail-performance-telemetry";
import { isThreadUnread } from "@/app/(app)/[emailAccountId]/mail/read-state";
import { MailLayout, MailSplitFilterKind } from "@/generated/prisma/enums";
import { useSidebar } from "@/components/ui/sidebar";
import { useAtomValue, useSetAtom } from "jotai";
import {
  commandPaletteOpenAtom,
  mailCommandContextAtom,
  senderCommandContextAtom,
  shortcutsDialogOpenAtom,
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
import { undoLatestToast } from "@/components/Toast";
import { useDisplayedEmail } from "@/hooks/useDisplayedEmail";
import { useLabels } from "@/hooks/useLabels";
import { useFolders } from "@/hooks/useFolders";
import { useMailSettings } from "@/hooks/useMailSettings";
import { useAccounts } from "@/hooks/useAccounts";
import { useThread } from "@/hooks/useThread";
import { useShortcuts } from "@/lib/shortcuts/useShortcuts";
import type { ShortcutHandlers } from "@/lib/shortcuts/registry";
import { updateMailPreferencesAction } from "@/utils/actions/mail-split";
import type { UpdateMailPreferencesBody } from "@/utils/actions/mail-split.validation";
import { submitConversationChange } from "@/utils/mail-engine/submit-conversations";
import { admissionRejectionCopy } from "@/utils/mail-engine/admission-notice";
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
import type { ThreadsQuery } from "@/utils/threads/validation";

// Module-level so an "empty" reader doesn't hand children a new array each render.
const NO_MESSAGES: ThreadMessage[] = [];
const NO_LABELS = {};

/**
 * Owns the mail screen's URL, thread list, selection, and triage state, and
 * composes the sidebar, list, and reader from memoized parts. J/K and engine
 * snapshots re-render this component, so everything passed down is kept
 * referentially stable and only the parts whose inputs changed re-render.
 */
export function MailShell() {
  const { emailAccount, emailAccountId, userEmail, provider } = useAccount();
  const { data: accountsData } = useAccounts();
  const isGoogle = isGoogleProvider(provider);
  const isOutlook = isMicrosoftProvider(provider);
  const { userLabels } = useEmail();
  const { userLabels: allLabels, mutate: mutateLabels } = useLabels();
  const { folders } = useFolders(provider);
  const { data: settings, mutate: mutateSettings } = useMailSettings();
  const { toggleSidebar } = useSidebar();
  const isPaletteOpen = useAtomValue(commandPaletteOpenAtom);
  const isHelpOpen = useAtomValue(shortcutsDialogOpenAtom);
  const setIsHelpOpen = useSetAtom(shortcutsDialogOpenAtom);
  const senderCommandContext = useAtomValue(senderCommandContextAtom);
  const setMailCommandContext = useSetAtom(mailCommandContextAtom);
  // The side panel viewer owns the triage keys while it's open, so this screen
  // stands down rather than both archiving the same keystroke.
  const { threadId: sidePanelThreadId } = useDisplayedEmail();
  const client = useOptionalMailClient();

  const [openThreadQuery, setOpenThreadQuery] = useQueryStates({
    "thread-id": parseAsString,
    "thread-account-id": parseAsString,
  });
  const openThreadId = openThreadQuery["thread-id"];
  const openThreadAccountId = openThreadQuery["thread-account-id"];
  const [activeSplitId, setActiveSplitId] = useQueryState("split");
  const [accountScope, setAccountScope] = useQueryState("accountScope");
  const [scopeType, setScopeType] = useQueryState("type");
  const [scopeLabelId, setScopeLabelId] = useQueryState("labelId");
  const [scopeFolderId, setScopeFolderId] = useQueryState("folderId");
  const [searchParam, setSearchParam] = useQueryState("q");

  const [focusedIndex, setFocusedIndex] = useState(0);
  const [isDesktopApp, setIsDesktopApp] = useState(false);
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

  useEffect(() => {
    setIsDesktopApp(Boolean(getInboxZeroDesktopApp()));
  }, []);

  const isAllAccounts = accountScope === "all";
  const setOpenThread = useCallback(
    (selection: ThreadSelection | null) => {
      setIsMenuOpen(false);
      return setOpenThreadQuery({
        "thread-id": selection?.threadId ?? null,
        "thread-account-id":
          isAllAccounts && selection ? selection.emailAccountId : null,
      });
    },
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

  const searchEditIdentity = JSON.stringify([
    emailAccountId,
    isAllAccounts,
    searchParam,
    scopeType,
    scopeLabelId,
    scopeFolderId,
  ]);
  const [searchDraft, setSearchDraft] = useState<{
    identity: string;
    value: string;
  }>();
  if (searchDraft && searchDraft.identity !== searchEditIdentity)
    setSearchDraft(undefined);
  const searchValue =
    (searchDraft?.identity === searchEditIdentity
      ? searchDraft.value
      : searchParam) ?? "";
  const searchQuery = searchValue.trim() || null;
  // Scheduled sends live in our own database, so this view has no thread
  // list to fetch.
  const isScheduledView =
    !isAllAccounts && !searchQuery && scopeType === MAIL_SCHEDULED_TYPE;
  const [settledSearch, setSettledSearch] = useState(searchQuery);
  useEffect(() => {
    const timeout = setTimeout(() => setSettledSearch(searchQuery), 250);
    return () => clearTimeout(timeout);
  }, [searchQuery]);
  const searchSettled = !searchQuery || searchQuery === settledSearch;
  const setSearch = useCallback(
    (value: string) => {
      setSearchDraft(undefined);
      setSettledSearch(value.trim() || null);
      return setSearchParam(value.trim() || null);
    },
    [setSearchParam],
  );
  const onSearchChange = useCallback(
    (value: string) => setSearchDraft({ identity: searchEditIdentity, value }),
    [searchEditIdentity],
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
  const splitTabs = useMemo(
    () =>
      splits.map((split) => ({
        ...split,
        deletable: split.filters.length > 0,
      })),
    [splits],
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
    enabled: !isAllAccounts && searchSettled && !isScheduledView,
  });
  const combinedThreadState = useCombinedMailThreads({
    accounts: combinedAccounts,
    emailAccountId,
    enabled: isAllAccounts && searchSettled,
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
  const splitCountAccountIds = useMemo(
    () =>
      isAllAccounts
        ? combinedAccounts.map((account) => account.id)
        : [emailAccountId],
    [combinedAccounts, emailAccountId, isAllAccounts],
  );
  const {
    threads: remoteThreads,
    isLoading,
    error,
    hasMore,
    isLoadingMore,
    loadMore,
    refetch: refetchThreadList,
  } = isAllAccounts ? combinedThreadState : accountThreadState;
  const providerState = isAllAccounts
    ? combinedThreadState
    : accountThreadState;
  const hasProviderResponse = searchSettled && providerState.hasRemoteResponse;
  const threads = searchSettled ? remoteThreads : EMPTY_SEARCH_THREADS;
  const searchViewIdentity = JSON.stringify([
    emailAccountId,
    isAllAccounts,
    searchQuery,
  ]);
  const orderedIds = useStableOrderedIds(threads);
  const previousSearchFocus = useRef<
    ReturnType<typeof getSearchFocus> | undefined
  >(undefined);
  useLayoutEffect(() => {
    const next = getSearchFocus({
      previous: previousSearchFocus.current,
      view: searchQuery ? searchViewIdentity : null,
      focusedIndex,
      orderedIds,
    });
    previousSearchFocus.current = next;
    if (next.index !== focusedIndex) setFocusedIndex(next.index);
  }, [orderedIds, focusedIndex, searchQuery, searchViewIdentity]);
  let emptySearchMessage: string | undefined;
  if (searchQuery && hasProviderResponse && !threads.length) {
    emptySearchMessage = "No emails in this view";
  }

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
  useWarmNeighbourThreads({ threads, openThreadKey, emailAccountId });

  // Defer the pair as one value: rendering a new id with the previous account
  // would be worse than fetching eagerly when J/K moves between account rows.
  const deferredReaderSelection = useDeferredValue(openThreadSelection);
  const readerThreadKey = getThreadSelectionKey(deferredReaderSelection);
  const openReaderThreadKey = getThreadSelectionKey(openThreadSelection);
  useLayoutEffect(() => {
    if (openReaderThreadKey) setIsMenuOpen(false);
  }, [openReaderThreadKey]);
  const readerSelectionSettled = readerThreadKey === openReaderThreadKey;
  const [visibleReaderThreadKey, setVisibleReaderThreadKey] =
    useState<string>();
  useMailPerformanceTelemetry({
    openThreadKey: openReaderThreadKey,
    visibleThreadKey: visibleReaderThreadKey,
  });
  const {
    data: openThreadData,
    error: openThreadError,
    isLoading: isOpenThreadLoading,
    mutate: refetchOpenThread,
    localAvailability: openThreadLocalAvailability,
  } = useThread(
    {
      id: deferredReaderSelection?.threadId ?? null,
      emailAccountId: deferredReaderSelection?.emailAccountId,
    },
    { includeDrafts: true, localMail: true },
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
    // Navigation can outpace the visible reader; do not act on an unseen email.
    if (
      openReaderThreadKey &&
      openReaderThreadKey !== visibleReaderThreadKey &&
      !selection.hasSelection
    )
      return [];
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
    openReaderThreadKey,
    visibleReaderThreadKey,
    selection.hasSelection,
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
    setReadState,
    setStarredState,
    snooze,
    undo,
  } = useThreadActions({
    emailAccountId,
    readerTarget,
    threads,
  });
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

  const labelHref = useCallback(
    (labelId: string) =>
      prefixPath(
        openThreadSelection?.emailAccountId ?? emailAccountId,
        getMailNavPath({ kind: "label", labelId }),
      ),
    [emailAccountId, openThreadSelection?.emailAccountId],
  );

  const runOn = useStableCallback(
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
  );

  const openAt = useStableCallback((index: number) => {
    const thread = threads[index];
    if (!thread) return;
    setFocusedIndex(index);
    setReplyToMessageId(undefined);
    setForwardToMessageId(undefined);
    selection.clear();
    setOpenThread(getListThreadSelection(thread, emailAccountId));
  });

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
  const markUnreadTargets = useStableCallback(() =>
    runOn((ids) => {
      if (openThreadKey && ids.includes(openThreadKey)) {
        readAttemptedForOpenThread.current = openThreadKey;
      }
      return setReadState(ids, false);
    }, true),
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
  // Outlook categories use the same engine membership command as Gmail labels.
  const canLabel =
    currentLabelTargets.length > 0 &&
    (isGoogleProvider(labelAccount?.account.provider) ||
      isMicrosoftProvider(labelAccount?.account.provider)) &&
    currentLabelTargets.every(
      (target) => target.emailAccountId === labelAccountId,
    );
  const openLabelPicker = useStableCallback(() => {
    if (canLabel)
      setLabelPicker({ mode: "label", targets: currentLabelTargets });
  });
  const openMovePicker = useStableCallback(() => {
    if (canLabel)
      setLabelPicker({ mode: "move", targets: currentLabelTargets });
  });
  const singleActionTarget =
    actionTargets.length === 1 ? actionTargets.at(0) : undefined;
  const requestForwardTarget = useStableCallback(() => {
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
  });
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
    setSearchDraft(undefined);
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

  const closeReader = useCallback(() => {
    setOpenThread(null);
  }, [setOpenThread]);

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
      undo: async () => {
        if (await undoLatestToast()) return;
        await undo();
      },
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

  // Senders the reader actually corresponds with, so "Describe it" can turn a
  // person's name into an address instead of guessing a domain.
  const getSplitSenders = useStableCallback(() => {
    const seen = new Set<string>();
    for (const thread of threads) {
      const from = thread.messages.at(-1)?.headers.from;
      const address = from ? extractEmailAddress(from) : null;
      if (address && address !== userEmail) seen.add(address);
      if (seen.size >= 50) break;
    }
    return [...seen];
  });

  const onMailboxItemDeleted = useCallback(
    async (item: MailboxItem) => {
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
      if (item.kind === "label") await mutateSettings();
    },
    [
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
    ],
  );

  const onRemoveLabel = useStableCallback(async (labelId: string) => {
    if (!openThreadSelection || !client) return;
    try {
      const { admission } = await submitConversationChange({
        client,
        accountId: openThreadSelection.emailAccountId,
        conversationId: openThreadSelection.threadId,
        change: {
          kind: "set_membership",
          membership: "label",
          id: labelId,
          present: false,
        },
      });
      if (admission.status === "rejected") {
        toast.error(
          admissionRejectionCopy(admission.code) ?? "Couldn't remove label",
        );
      }
    } catch {
      toast.error("Couldn't remove label");
    }
  });

  const refetchReader = useStableCallback(() => {
    Promise.allSettled([refetchOpenThread(), refetchThreadList()]);
  });

  const markOpenThreadRead = useStableCallback(() => {
    if (!openThreadKey) return;
    setReadState([openThreadKey], true);
  });
  const onSendSuccess = useStableCallback(
    (_messageId: string, sentThreadId: string) => {
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
    },
  );
  const onToggleAssistant = useStableCallback(() =>
    toggleSidebar(["chat-sidebar"]),
  );
  const searchFolders = useMemo(
    () =>
      isOutlook && !isAllAccounts
        ? getMailSearchFolders(folders)
        : NO_SEARCH_OPTIONS,
    [folders, isAllAccounts, isOutlook],
  );

  const showList = layout === "split" || !openThreadSelection;
  const showReader = layout === "split" || Boolean(openThreadSelection);
  const readerUserLabels = isAllAccounts
    ? (labelsByAccount[openThreadSelection?.emailAccountId ?? ""] ?? NO_LABELS)
    : userLabels;

  const senderCommandsPanel =
    !isReaderTarget &&
    singleActionTarget &&
    senderAccount &&
    !sidePanelThreadId ? (
      <EmailAccountScopeProvider emailAccount={senderAccount}>
        <ListSenderCommands
          key={singleActionTarget.key}
          message={singleActionTarget.messages.at(-1) ?? null}
        />
      </EmailAccountScopeProvider>
    ) : null;

  const labelPickerDialog =
    labelPicker && pickerAccount ? (
      <EmailAccountScopeProvider emailAccount={pickerAccount}>
        <LabelPickerDialog
          threadIds={labelPicker.targets.map((target) => target.threadId)}
          mode={labelPicker.mode}
          onClose={() => setLabelPicker(null)}
          onApplied={(threadIds, _labelId) => {
            const keys = threadIds.map((threadId) =>
              isAllAccounts ? `${pickerAccount.id}:${threadId}` : threadId,
            );
            // Also refreshes the sidebar's label counts.
            client?.requestSync([pickerAccount.id]).catch(() => undefined);
            refetchOpenThread();
            refetchThreadList();
            if (labelPicker.mode === "move") {
              if (openThreadKey && keys.includes(openThreadKey)) {
                setOpenThread(null);
              }
              selection.clear();
            }
            mutateLabels();
          }}
        />
      </EmailAccountScopeProvider>
    ) : null;

  return (
    <MailProductFrame
      accountSwitcher={
        <MailAccountSwitcher
          isDesktopApp={isDesktopApp}
          isAllAccounts={isAllAccounts}
          onSelectAccount={selectAccount}
          onSelectAll={selectAllAccounts}
          variant="compact"
        />
      }
      floating={senderCommandsPanel}
      dialogs={labelPickerDialog}
    >
      <MailShellSidebar
        activeType={
          scopeLabelId || scopeFolderId ? null : (scopeType ?? "inbox")
        }
        activeLabelId={scopeLabelId}
        activeFolderId={scopeFolderId}
        isAllAccounts={isAllAccounts}
        isDesktopApp={isDesktopApp}
        onSelectAccount={selectAccount}
        onSelectAllAccounts={selectAllAccounts}
        onMailboxItemDeleted={onMailboxItemDeleted}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <MailEngineConnectionBanner />
        <div className="flex min-h-0 min-w-0 flex-1">
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
                searchQuery={searchParam ?? ""}
                onSearch={setSearch}
                searchValue={searchValue}
                onSearchChange={onSearchChange}
                searchInputRef={searchInputRef}
                searchLabels={isAllAccounts ? NO_SEARCH_OPTIONS : allLabels}
                searchFolders={searchFolders}
                searchVariant={getMailSearchVariant({
                  isAllAccounts,
                  isOutlook,
                })}
                onToggleLayout={toggleLayout}
                expandedPreview={expandedPreview}
                onTogglePreview={togglePreview}
                onToggleAssistant={onToggleAssistant}
                showLayoutToggle={!isAllAccounts}
                threadCount={threads.length}
                selectedCount={selection.selectedCount}
                onSelectAll={selection.selectAll}
                onArchiveSelected={archiveTargets}
                onDeleteSelected={trashTargets}
                isUnreadSelected={actionTargets.some((target) =>
                  isThreadUnread(target.messages),
                )}
                onMarkReadSelected={markReadTargets}
                onMarkUnreadSelected={markUnreadTargets}
                onLabelSelected={canLabel ? openLabelPicker : undefined}
                onClearSelection={selection.clear}
              />
              {!isScoped && !searchQuery && (
                <MailSplitTabs
                  splits={splitTabs}
                  activeSplitId={displayedActiveSplitId}
                  onSelectSplit={setActiveSplitId}
                  isAllAccounts={isAllAccounts}
                  getSenders={getSplitSenders}
                  countAccountIds={splitCountAccountIds}
                  portableLabelSplits={
                    isAllAccounts ? combinedLabelSplits : undefined
                  }
                  labelsByAccount={isAllAccounts ? labelsByAccount : undefined}
                />
              )}
              {isAllAccounts && combinedThreadState.failedAccountIds.length ? (
                <div className="border-border border-b bg-amber-50 px-3 py-2 text-amber-900 text-xs dark:bg-amber-950/30 dark:text-amber-200">
                  Some inboxes couldn&apos;t be loaded. Try again shortly or
                  check their connections.
                </div>
              ) : null}
              <MailPanelErrorBoundary
                resetKey={JSON.stringify([
                  emailAccountId,
                  isAllAccounts,
                  query,
                  displayedActiveSplitId,
                  searchQuery,
                ])}
                title="Unable to show your mail list"
              >
                {isScheduledView ? (
                  <ScheduledEmailList />
                ) : (
                  <LoadingContent
                    loading={
                      !threads.length &&
                      (isLoading || (!!searchQuery && !searchSettled))
                    }
                    error={searchQuery ? undefined : error}
                  >
                    <ThreadList
                      threads={threads}
                      emptyMessage={emptySearchMessage}
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
                      showSentOpenStatus={
                        scopeType === "sent" && !isAllAccounts
                      }
                      listKey={
                        isAllAccounts
                          ? `all-accounts:${searchQuery ?? displayedActiveSplitId}`
                          : JSON.stringify(query)
                      }
                    />
                  </LoadingContent>
                )}
              </MailPanelErrorBoundary>
            </section>
          )}

          {showReader ? (
            <MailReaderPane
              readerEmailAccount={readerEmailAccount}
              readerKey={openReaderThreadKey}
              planSelection={deferredReaderSelection}
              dataReady={
                !openThreadSelection ||
                (readerSelectionSettled &&
                  Boolean(openThreadData || openThreadError))
              }
              onReady={setVisibleReaderThreadKey}
              onClose={closeReader}
              showFixWithChat={
                !isAllAccounts ||
                openThreadSelection?.emailAccountId === emailAccountId
              }
              lastMessage={openMessages.at(-1) ?? null}
              isStarred={allStarred}
              onToggleStar={starTargets}
              onMarkSpam={markSpamTargets}
              onDelete={trashTargets}
              onLabel={canLabel ? openLabelPicker : undefined}
              onMove={canLabel ? openMovePicker : undefined}
              isMenuOpen={isMenuOpen}
              onMenuOpenChange={setIsMenuOpen}
              enableMessageNavigation={!sidePanelThreadId}
              thread={openThread ?? null}
              threadId={openThreadId}
              detailSelectionSettled={readerSelectionSettled}
              loading={
                Boolean(openThreadSelection) &&
                (!readerSelectionSettled || isOpenThreadLoading)
              }
              error={readerSelectionSettled ? openThreadError : undefined}
              messages={openMessages}
              localAvailability={
                readerSelectionSettled ? openThreadLocalAvailability : undefined
              }
              userLabels={readerUserLabels}
              layout={layout}
              labelHref={labelHref}
              onRemoveLabel={onRemoveLabel}
              onArchive={archiveTargets}
              isUnread={isOpenThreadUnread}
              onMarkRead={markOpenThreadRead}
              onMarkUnread={markUnreadTargets}
              refetch={refetchReader}
              onSendSuccess={onSendSuccess}
              autoOpenReplyForMessageId={replyToMessageId}
              autoOpenForwardForMessageId={forwardToMessageId}
            />
          ) : null}
        </div>
      </div>
    </MailProductFrame>
  );
}

function getMailSearchVariant({
  isAllAccounts,
  isOutlook,
}: {
  isAllAccounts: boolean;
  isOutlook: boolean;
}): "gmail" | "outlook" | "common" {
  if (isAllAccounts) return "common";
  if (isOutlook) return "outlook";
  return "gmail";
}

function useStableOrderedIds(threads: ListThread[]) {
  const previous = useRef<string[]>([]);
  // Selection callbacks close over the ids; keeping them while the order is
  // unchanged means a snapshot that edits one row doesn't re-render every row.
  return useMemo(() => {
    const ids = threads.map(getListThreadKey);
    const unchanged =
      ids.length === previous.current.length &&
      ids.every((id, index) => id === previous.current[index]);
    if (!unchanged) previous.current = ids;
    return previous.current;
  }, [threads]);
}

const EMPTY_SEARCH_THREADS: ListThread[] = [];
const NO_SEARCH_OPTIONS: { name: string }[] = [];
