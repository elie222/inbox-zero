"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import { toast } from "sonner";
import { HintBar } from "@/app/(app)/[emailAccountId]/mail/HintBar";
import { ListToolbar } from "@/app/(app)/[emailAccountId]/mail/ListToolbar";
import { MailSidebar } from "@/app/(app)/[emailAccountId]/mail/MailSidebar";
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
import { useMailThreads } from "@/app/(app)/[emailAccountId]/mail/use-mail-threads";
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
import { createLabelAction } from "@/utils/actions/mail";
import { mailSplitToThreadsQuery } from "@/utils/mail/split-query";
import { prefixPath } from "@/utils/path";
import type { ThreadsQuery } from "@/utils/threads/validation";

// Always present, never deletable. Everything else is a saved split.
const BUILT_IN_SPLITS: MailSplitTab[] = [
  { id: "all", name: "All", deletable: false },
  { id: "unread", name: "Unread", deletable: false },
];

const CATEGORY_OPTIONS = [
  { name: "Personal", value: "CATEGORY_PERSONAL" },
  { name: "Social", value: "CATEGORY_SOCIAL" },
  { name: "Updates", value: "CATEGORY_UPDATES" },
  { name: "Forums", value: "CATEGORY_FORUMS" },
  { name: "Promotions", value: "CATEGORY_PROMOTIONS" },
];

export function MailShell() {
  const { emailAccountId, userEmail, provider } = useAccount();
  // Gmail categories have no Outlook equivalent, so they're hidden rather than
  // rendered as rows and split options that can never match anything.
  const showCategories = isGoogleProvider(provider);
  const { userLabels } = useEmail();
  const { visibleLabels } = useSplitLabels();
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
  const [layoutOverride, setLayoutOverride] = useState<MailLayoutMode>();
  const [hintBarHidden, setHintBarHidden] = useState(false);

  const layout: MailLayoutMode =
    layoutOverride ??
    (settings?.layout === MailLayout.SPLIT ? "split" : "list");

  // A sidebar selection scopes the whole list, which replaces the split tabs —
  // splits are a way of slicing the inbox, not of slicing an arbitrary view.
  const isScoped = Boolean(
    scopeLabelId || (scopeType && scopeType !== "inbox"),
  );

  const splits: MailSplitTab[] = useMemo(
    () => [
      ...BUILT_IN_SPLITS,
      ...(settings?.splits ?? []).map((split) => ({
        id: split.id,
        name: split.name,
        deletable: true,
      })),
    ],
    [settings?.splits],
  );

  const query: ThreadsQuery = useMemo(() => {
    if (scopeLabelId) return { labelId: scopeLabelId };
    if (scopeType && scopeType !== "inbox") return { type: scopeType };
    if (activeSplitId === "unread") return { type: "inbox", isUnread: true };

    const saved = settings?.splits?.find((split) => split.id === activeSplitId);
    if (saved) return mailSplitToThreadsQuery(saved);

    return { type: "inbox" };
  }, [scopeLabelId, scopeType, activeSplitId, settings?.splits]);

  const {
    threads,
    isLoading,
    hasMore,
    isLoadingMore,
    loadMore,
    removeThreads,
    restoreThreads,
  } = useMailThreads(query);

  const orderedIds = useMemo(() => threads.map((t) => t.id), [threads]);
  const selection = useThreadSelection(orderedIds);
  const { archive, trash, undo } = useThreadActions({
    emailAccountId,
    removeThreads,
    restoreThreads,
  });

  const clampedIndex = Math.min(focusedIndex, Math.max(0, threads.length - 1));
  const focusedThread = threads[clampedIndex];
  const openThread = threads.find((t) => t.id === openThreadId);

  const { data: openThreadData, mutate: refetchOpenThread } = useThread(
    { id: openThreadId ?? "" },
    { includeDrafts: true },
  );
  const openMessages = openThreadId ? openThreadData?.thread.messages : [];

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
      const next = Math.min(
        Math.max(0, clampedIndex + delta),
        Math.max(0, threads.length - 1),
      );
      setFocusedIndex(next);
      // In split view the reader tracks the cursor; in list view it doesn't,
      // so J/K browses the list without yanking you out of what you're reading.
      if (layout === "split" && threads[next])
        setOpenThreadId(threads[next].id);
    },
    [clampedIndex, threads, layout, setOpenThreadId],
  );

  const extendSelection = useCallback(
    (delta: number) => {
      const next = Math.min(
        Math.max(0, clampedIndex + delta),
        Math.max(0, threads.length - 1),
      );
      selection.extendTo(next, clampedIndex);
      setFocusedIndex(next);
    },
    [clampedIndex, threads.length, selection],
  );

  const toggleLayout = useCallback(() => {
    const next: MailLayoutMode = layout === "split" ? "list" : "split";
    setLayoutOverride(next);
    updateMailPreferencesAction(emailAccountId, {
      layout: next === "split" ? MailLayout.SPLIT : MailLayout.LIST,
    });
  }, [layout, emailAccountId]);

  const handlers: ShortcutHandlers = useMemo(() => {
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
      archive: () => runOn(archive),
      delete: () => runOn(trash),
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
  }, [
    sidePanelThreadId,
    move,
    openAt,
    clampedIndex,
    splits,
    activeSplitId,
    setActiveSplitId,
    selection,
    extendSelection,
    runOn,
    archive,
    trash,
    openThreadId,
    focusedThread,
    openMessages,
    setOpenThreadId,
    undo,
    toggleLayout,
    isFocusMode,
    layout,
  ]);

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
      ...(showCategories ? CATEGORY_OPTIONS : []).map((category) => ({
        id: `category:${category.value}`,
        name: category.name,
        kind: MailSplitKind.CATEGORY,
        value: category.value,
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
      if (result?.serverError) {
        toast.error(result.serverError);
        return;
      }
      mutateSettings();
    },
    [emailAccountId, mutateSettings],
  );

  const onDeleteSplit = useCallback(
    async (splitId: string) => {
      if (activeSplitId === splitId) setActiveSplitId("all");
      await deleteMailSplitAction(emailAccountId, { id: splitId });
      mutateSettings();
    },
    [emailAccountId, mutateSettings, activeSplitId, setActiveSplitId],
  );

  const onCreateLabel = useCallback(
    async (name: string) => {
      const result = await createLabelAction(emailAccountId, { name });
      if (result?.serverError) toast.error(result.serverError);
      else toast.success(`Label "${name}" created`);
    },
    [emailAccountId],
  );

  const showList = !isFocusMode && (layout === "split" || !openThreadId);
  const showReader = layout === "split" || Boolean(openThreadId);
  const showHintBar =
    !hintBarHidden && !settings?.hintBarDismissed && !isFocusMode;

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
            onOpenShortcuts={() => setIsHelpOpen(true)}
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
              onArchiveSelected={() => runOn(archive)}
              onDeleteSelected={() => runOn(trash)}
              onClearSelection={selection.clear}
              emptyTitle={isLoading ? "Loading…" : "Nothing in this view"}
              showLoadMore={hasMore}
              isLoadingMore={Boolean(isLoadingMore)}
              onLoadMore={loadMore}
            />
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
            labelHref={(labelId) => hrefFor({ kind: "label", labelId })}
            onBack={() => {
              setIsFocusMode(false);
              setOpenThreadId(null);
            }}
            onArchive={() => runOn(archive)}
            onDelete={() => runOn(trash)}
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
          onDismiss={() => {
            setHintBarHidden(true);
            updateMailPreferencesAction(emailAccountId, {
              hintBarDismissed: true,
            });
          }}
        />
      )}

      <ShortcutsDialog open={isHelpOpen} onOpenChange={setIsHelpOpen} />
    </div>
  );
}
