"use client";

import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import { toast } from "sonner";
import { HintBar } from "@/app/(app)/[emailAccountId]/mail/HintBar";
import { ListToolbar } from "@/app/(app)/[emailAccountId]/mail/ListToolbar";
import {
  MAIL_CATEGORIES,
  MailSidebar,
} from "@/app/(app)/[emailAccountId]/mail/MailSidebar";
import type { MailNavTarget } from "@/app/(app)/[emailAccountId]/mail/MailSidebar";
import { RuleAttributionMenu } from "@/app/(app)/[emailAccountId]/mail/RuleAttributionMenu";
import { ShortcutsDialog } from "@/app/(app)/[emailAccountId]/mail/ShortcutsDialog";
import { SplitTabs } from "@/app/(app)/[emailAccountId]/mail/SplitTabs";
import type { MailSplitTab } from "@/app/(app)/[emailAccountId]/mail/SplitTabs";
import type {
  NewSplitDraft,
  NewSplitOption,
} from "@/app/(app)/[emailAccountId]/mail/NewSplitPopover";
import { ThreadList } from "@/app/(app)/[emailAccountId]/mail/ThreadList";
import { ThreadReader } from "@/app/(app)/[emailAccountId]/mail/ThreadReader";
import type { MailLayoutMode } from "@/app/(app)/[emailAccountId]/mail/types";
import type { ThreadMessage } from "@/components/email-list/types";
import { useMailThreads } from "@/app/(app)/[emailAccountId]/mail/use-mail-threads";
import { useAdjacentThreadPrefetch } from "@/app/(app)/[emailAccountId]/mail/use-adjacent-thread-prefetch";
import { useThreadActions } from "@/app/(app)/[emailAccountId]/mail/use-thread-actions";
import { useThreadSelection } from "@/app/(app)/[emailAccountId]/mail/use-thread-selection";
import { MailLayout, MailSplitKind } from "@/generated/prisma/enums";
import { useChat } from "@/providers/ChatProvider";
import { useSidebar } from "@/components/ui/sidebar";
import { useSetAtom } from "jotai";
import { commandPaletteOpenAtom } from "@/store/command-palette";
import { useAccount } from "@/providers/EmailAccountProvider";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { useEmail } from "@/providers/EmailProvider";
import { useComposeModal } from "@/providers/ComposeModalProvider";
import { useDisplayedEmail } from "@/hooks/useDisplayedEmail";
import { useLabelCounts } from "@/hooks/useLabelCounts";
import { useSplitLabels } from "@/hooks/useLabels";
import { useMailSettings } from "@/hooks/useMailSettings";
import { useThread } from "@/hooks/useThread";
import { useShortcuts } from "@/lib/shortcuts/useShortcuts";
import type { ShortcutHandlers } from "@/lib/shortcuts/registry";
import {
  createMailSplitAction,
  deleteMailSplitAction,
  updateMailPreferencesAction,
} from "@/utils/actions/mail-split";
import type { UpdateMailPreferencesBody } from "@/utils/actions/mail-split.validation";
import {
  createLabelAction,
  removeThreadLabelAction,
} from "@/utils/actions/mail";
import { mailSplitToThreadsQuery } from "@/utils/mail/split-query";
import { getActionErrorMessage } from "@/utils/error";
import { prefixPath } from "@/utils/path";
import { LoadingContent } from "@/components/LoadingContent";
import type { ThreadsQuery } from "@/utils/threads/validation";

// Always present, never deletable. Everything else is a saved split. They carry
// a kind so built-ins and saved splits resolve through one mapping.
const BUILT_IN_SPLITS = [
  { id: "all", name: "All", kind: MailSplitKind.INBOX, value: null },
  { id: "unread", name: "Unread", kind: MailSplitKind.UNREAD, value: null },
] as const;

// Module-level so an "empty" reader doesn't hand children a new array each render.
const NO_MESSAGES: ThreadMessage[] = [];

export function MailShell() {
  const { emailAccountId, userEmail, provider } = useAccount();
  // Gmail categories have no Outlook equivalent, so they're hidden rather than
  // rendered as rows and split options that can never match anything.
  const showCategories = isGoogleProvider(provider);
  const { userLabels } = useEmail();
  const { visibleLabels, mutate: mutateLabels } = useSplitLabels();
  const { countsById } = useLabelCounts();
  const { data: settings, mutate: mutateSettings } = useMailSettings();
  const { onOpen: openCompose } = useComposeModal();
  const { setInput: setChatInput } = useChat();
  const { toggleSidebar } = useSidebar();
  const setPaletteOpen = useSetAtom(commandPaletteOpenAtom);
  // The side panel viewer owns the triage keys while it's open, so this screen
  // stands down rather than both archiving the same keystroke.
  const { threadId: sidePanelThreadId } = useDisplayedEmail();

  const [openThreadId, setOpenThreadId] = useQueryState("thread-id");
  const [activeSplitId, setActiveSplitId] = useQueryState("split", {
    defaultValue: "all",
  });
  const [scopeType] = useQueryState("type");
  const [scopeLabelId] = useQueryState("labelId");

  const [focusedIndex, setFocusedIndex] = useState(0);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [replyToMessageId, setReplyToMessageId] = useState<string>();

  const layout: MailLayoutMode =
    settings?.layout === MailLayout.SPLIT ? "split" : "list";

  // Written through the SWR cache rather than mirrored in local state, so the
  // preference has one source of truth and every reader sees the new value.
  const savePreferences = useCallback(
    (patch: UpdateMailPreferencesBody) => {
      mutateSettings(
        async (current) => {
          const result = await updateMailPreferencesAction(
            emailAccountId,
            patch,
          );
          // Thrown so SWR rolls the optimistic value back rather than leaving
          // the UI showing a preference the server never accepted.
          if (result?.serverError || result?.validationErrors)
            throw new Error(getActionErrorMessage(result));
          return current;
        },
        {
          optimisticData: (current) => ({
            layout: patch.layout ?? current?.layout ?? null,
            hintBarDismissed:
              patch.hintBarDismissed ?? current?.hintBarDismissed ?? false,
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
    },
    [emailAccountId, mutateSettings],
  );

  // A sidebar selection scopes the whole list, which replaces the split tabs —
  // splits are a way of slicing the inbox, not of slicing an arbitrary view.
  // Resolved once so the tab bar and the fetched rows can't disagree.
  const scopeQuery: ThreadsQuery | null = useMemo(() => {
    if (scopeLabelId) return { labelId: scopeLabelId };
    if (scopeType && scopeType !== "inbox") return { type: scopeType };
    return null;
  }, [scopeLabelId, scopeType]);
  const isScoped = scopeQuery !== null;

  const splits: MailSplitTab[] = useMemo(
    () => [
      ...BUILT_IN_SPLITS.map((split) => ({
        id: split.id,
        name: split.name,
        deletable: false,
      })),
      ...(settings?.splits ?? []).map((split) => ({
        id: split.id,
        name: split.name,
        deletable: true,
      })),
    ],
    [settings?.splits],
  );

  const query: ThreadsQuery = useMemo(() => {
    if (scopeQuery) return scopeQuery;

    const active =
      settings?.splits?.find((split) => split.id === activeSplitId) ??
      BUILT_IN_SPLITS.find((split) => split.id === activeSplitId) ??
      BUILT_IN_SPLITS[0];

    return mailSplitToThreadsQuery(active);
  }, [scopeQuery, activeSplitId, settings?.splits]);

  const {
    threads,
    isLoading,
    error,
    hasMore,
    isLoadingMore,
    loadMore,
    removeThreads,
    restoreThreads,
  } = useMailThreads({ emailAccountId, query });

  const orderedIds = useMemo(() => threads.map((t) => t.id), [threads]);
  const selection = useThreadSelection(orderedIds);
  const { archive, trash, undo } = useThreadActions({
    emailAccountId,
    removeThreads,
    restoreThreads,
  });

  const clampIndex = useCallback(
    (index: number) =>
      Math.min(Math.max(0, index), Math.max(0, threads.length - 1)),
    [threads.length],
  );
  const clampedIndex = clampIndex(focusedIndex);
  const focusedThread = threads[clampedIndex];
  const openThread = threads.find((t) => t.id === openThreadId);

  // Deferred so holding J/K in split view doesn't fire a full-thread provider
  // fetch for every row the cursor passes over — only the row you settle on.
  const readerThreadId = useDeferredValue(openThreadId);
  useAdjacentThreadPrefetch({
    currentThreadId: readerThreadId,
    emailAccountId,
    threadIds: orderedIds,
  });
  const { data: openThreadData, mutate: refetchOpenThread } = useThread(
    { id: readerThreadId },
    { includeDrafts: true },
  );
  // Withheld until the deferred id catches up, so a fast J/K can't pair the new
  // thread's header with the previous thread's body.
  const openMessages =
    readerThreadId === openThreadId
      ? (openThreadData?.thread.messages ?? NO_MESSAGES)
      : NO_MESSAGES;

  const hrefFor = useCallback(
    (target: MailNavTarget) =>
      prefixPath(
        emailAccountId,
        target.kind === "label"
          ? `/mail?type=label&labelId=${encodeURIComponent(target.labelId)}`
          : `/mail?type=${encodeURIComponent(target.type)}`,
      ),
    [emailAccountId],
  );

  const labelHref = useCallback(
    (labelId: string) => hrefFor({ kind: "label", labelId }),
    [hrefFor],
  );

  const runOn = useCallback(
    (action: (ids: string[]) => void) => {
      const ids = selection.targetIds(focusedThread?.id);
      if (!ids.length) return;
      if (openThreadId && ids.includes(openThreadId)) setOpenThreadId(null);
      selection.clear();
      action(ids);
    },
    [selection, focusedThread?.id, openThreadId, setOpenThreadId],
  );

  const openAt = useCallback(
    (index: number) => {
      const thread = threads[index];
      if (!thread) return;
      setFocusedIndex(index);
      setReplyToMessageId(undefined);
      setOpenThreadId(thread.id);
    },
    [threads, setOpenThreadId],
  );

  const move = useCallback(
    (delta: number) => {
      const next = clampIndex(clampedIndex + delta);
      setFocusedIndex(next);
      // In split view the reader tracks the cursor; in list view it doesn't,
      // so J/K browses the list without yanking you out of what you're reading.
      if (layout === "split" && threads[next])
        setOpenThreadId(threads[next].id);
    },
    [clampIndex, clampedIndex, threads, layout, setOpenThreadId],
  );

  const extendSelection = useCallback(
    (delta: number) => {
      const next = clampIndex(clampedIndex + delta);
      selection.extendTo(next, clampedIndex);
      setFocusedIndex(next);
    },
    [clampIndex, clampedIndex, selection],
  );

  const toggleLayout = useCallback(() => {
    savePreferences({
      layout: layout === "split" ? MailLayout.LIST : MailLayout.SPLIT,
    });
  }, [layout, savePreferences]);

  const openShortcuts = useCallback(() => setIsHelpOpen(true), []);
  const archiveTargets = useCallback(() => runOn(archive), [runOn, archive]);
  const trashTargets = useCallback(() => runOn(trash), [runOn, trash]);

  // Not memoised: `useShortcuts` keeps handlers in a ref and only re-registers
  // when the set of handled ids changes, so a stable identity buys nothing.
  const handlers: ShortcutHandlers = (() => {
    if (sidePanelThreadId) return {};
    return {
      next: () => move(1),
      previous: () => move(-1),
      open: () => openAt(clampedIndex),
      backToList: () => {
        setIsFocusMode(false);
        setOpenThreadId(null);
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
      reply: () => {
        if (!openThreadId && focusedThread) setOpenThreadId(focusedThread.id);
        setReplyToMessageId(openMessages?.at(-1)?.id);
      },
      moreActions: () => setIsMenuOpen((open) => !open),
      undo: () => undo(),
      toggleLayout,
      focusMode: () => setIsFocusMode((on) => !on),
      close: () => {
        if (isFocusMode) setIsFocusMode(false);
        else if (selection.hasSelection) selection.clear();
        else if (layout === "list") setOpenThreadId(null);
      },
      help: () => setIsHelpOpen(true),
    };
  })();

  useShortcuts(handlers);

  const newSplitOptions: NewSplitOption[] = useMemo(
    () => [
      {
        id: "state:unread",
        name: "Unread",
        kind: MailSplitKind.UNREAD,
        value: null,
        group: "state",
      },
      ...(showCategories ? MAIL_CATEGORIES : []).map((category) => ({
        id: `category:${category.type}`,
        name: category.name,
        kind: MailSplitKind.CATEGORY,
        value: category.type,
        group: "category" as const,
      })),
      ...visibleLabels.map((label) => ({
        id: `label:${label.id}`,
        name: label.name,
        kind: MailSplitKind.LABEL,
        value: label.id,
        group: "label" as const,
      })),
    ],
    [visibleLabels, showCategories],
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
      toast.success(`Label "${name}" created`);
    },
    [emailAccountId, mutateLabels],
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

  const showList = !isFocusMode && (layout === "split" || !openThreadId);
  const showReader = layout === "split" || Boolean(openThreadId);
  const showHintBar = !settings?.hintBarDismissed && !isFocusMode;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex min-h-0 flex-1">
        {!isFocusMode && (
          <MailSidebar
            className="hidden lg:flex"
            activeType={scopeLabelId ? null : (scopeType ?? "inbox")}
            activeLabelId={scopeLabelId}
            hrefFor={hrefFor}
            labels={visibleLabels}
            countsById={countsById}
            showCategories={showCategories}
            backToAppHref={prefixPath(emailAccountId, "/automation")}
            onCompose={openCompose}
            onCreateLabel={onCreateLabel}
            onOpenShortcuts={openShortcuts}
          />
        )}

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
            <LoadingContent
              loading={isLoading && !threads.length}
              error={error}
            >
              <ThreadList
                threads={threads}
                layout={layout}
                userEmail={userEmail}
                userLabels={userLabels}
                focusedIndex={clampedIndex}
                isSelected={selection.isSelected}
                selectedCount={selection.selectedCount}
                onOpenThread={openAt}
                onToggleSelect={selection.toggle}
                onSelectRangeTo={selection.selectRangeTo}
                onArchiveSelected={archiveTargets}
                onDeleteSelected={trashTargets}
                onClearSelection={selection.clear}
                emptyTitle="Nothing in this view"
                showLoadMore={hasMore}
                isLoadingMore={isLoadingMore}
                onLoadMore={loadMore}
              />
            </LoadingContent>
          </section>
        )}

        {showReader && (
          <ThreadReader
            thread={openThread ?? null}
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
            refetch={refetchOpenThread}
            autoOpenReplyForMessageId={replyToMessageId}
            menu={
              <RuleAttributionMenu
                plans={openThread?.plans ?? []}
                message={openMessages?.at(-1) ?? null}
                setChatInput={setChatInput}
                open={isMenuOpen}
                onOpenChange={setIsMenuOpen}
              />
            }
          />
        )}
      </div>

      {showHintBar && (
        <HintBar
          status={`${threads.length} in view`}
          onDismiss={() => savePreferences({ hintBarDismissed: true })}
        />
      )}

      <ShortcutsDialog open={isHelpOpen} onOpenChange={setIsHelpOpen} />
    </div>
  );
}
