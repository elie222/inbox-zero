"use client";

import { useCallback, useRef, useState, useMemo } from "react";
import { useQueryState } from "nuqs";
import { useVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArchiveIcon,
  ChevronsDownIcon,
  ExternalLinkIcon,
  FolderInputIcon,
  MessageCircleIcon,
  SparklesIcon,
  Trash2Icon,
  WandSparklesIcon,
} from "lucide-react";
import { Celebration } from "@/components/Celebration";
import { BulkActionBar } from "@/components/email-list/BulkActionBar";
import { EmailPanel } from "@/components/email-list/EmailPanel";
import type { Thread } from "@/components/email-list/types";
import { Tabs } from "@/components/Tabs";
import { GroupHeading } from "@/components/GroupHeading";
import { Checkbox } from "@/components/Checkbox";
import { MessageText } from "@/components/Typography";
import { AlertBasic } from "@/components/Alert";
import { EmailListItem } from "@/components/email-list/EmailListItem";
import { RowContextMenu } from "@/components/email-list/RowContextMenu";
import { FilterLikeThisDialog } from "@/components/email-list/FilterLikeThisDialog";
import { ReprocessEmailDialog } from "@/components/email-list/ReprocessEmailDialog";
import { AiRuleFromEmailDialog } from "@/components/email-list/AiRuleFromEmailDialog";
import { useChat } from "@/providers/ChatProvider";
import { useSidebar } from "@/components/ui/sidebar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { bulkProcessThreadsAction } from "@/utils/actions/ai-rule";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
import {
  archiveEmails,
  deleteEmails,
  markReadThreads,
} from "@/store/archive-queue";
import { useAccount } from "@/providers/EmailAccountProvider";
import { internalDateToDate } from "@/utils/date";
import { prefixPath } from "@/utils/path";
import {
  unarchiveThreadAction,
  untrashThreadAction,
} from "@/utils/actions/mail";
import { isGoogleProvider } from "@/utils/email/provider-types";

export function List({
  emails,
  type,
  searchQuery,
  refetch,
  showLoadMore,
  isLoadingMore,
  handleLoadMore,
}: {
  emails: Thread[];
  type?: string;
  searchQuery?: string;
  refetch: (options?: { removedThreadIds?: string[] }) => void;
  showLoadMore?: boolean;
  isLoadingMore?: boolean;
  handleLoadMore?: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [selectedTab] = useQueryState("tab", { defaultValue: "all" });

  const planned = useMemo(
    () => emails.filter((email) => email.plan?.rule),
    [emails],
  );

  const tabs = useMemo(
    () => [
      {
        label: "All",
        value: "all",
        href: "/mail?tab=all",
      },
      {
        label: `Planned${planned.length ? ` (${planned.length})` : ""}`,
        value: "planned",
        href: "/mail?tab=planned",
      },
    ],
    [planned],
  );

  // only show tabs if there are planned emails or categorized emails
  const showTabs = !!planned.length;

  const filteredEmails = useMemo(() => {
    if (selectedTab === "planned") return planned;

    if (selectedTab === "all") return emails;

    return emails;
  }, [emails, selectedTab, planned]);

  return (
    <>
      {showTabs && (
        <div className="border-b border-border">
          <GroupHeading
            leftContent={
              <div className="overflow-x-auto py-2 md:max-w-lg lg:max-w-xl xl:max-w-3xl 2xl:max-w-4xl">
                <Tabs selected={selectedTab} tabs={tabs} breakpoint="xs" />
              </div>
            }
          />
        </div>
      )}
      {emails.length ? (
        <EmailList
          threads={filteredEmails}
          folderType={type ?? "inbox"}
          showLoadMore={showLoadMore}
          isLoadingMore={isLoadingMore}
          handleLoadMore={handleLoadMore}
          emptyMessage={
            <div className="px-2">
              {selectedTab === "planned" ? (
                <AlertBasic
                  title="No planned emails"
                  description={
                    <>
                      Set rules on the{" "}
                      <Link
                        href={prefixPath(emailAccountId, "/automation")}
                        className="font-semibold hover:underline"
                      >
                        Assistant page
                      </Link>{" "}
                      for our AI to handle incoming emails for you.
                    </>
                  }
                />
              ) : (
                <AlertBasic
                  title="All emails handled"
                  description="Great work!"
                />
              )}
            </div>
          }
          refetch={refetch}
        />
      ) : (
        <div className="mt-20">
          {searchQuery ? (
            <div className="px-4 text-center">
              <div className="font-title text-2xl text-primary">
                No emails found
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Nothing in your mail matches “{searchQuery}”.
              </p>
            </div>
          ) : type === "inbox" ? (
            <Celebration message={"You made it to Inbox Zero!"} />
          ) : (
            <div className="flex items-center justify-center font-title text-2xl text-primary">
              No emails to display
            </div>
          )}
        </div>
      )}
    </>
  );
}

export function EmailList({
  threads = [],
  folderType,
  emptyMessage,
  hideActionBarWhenEmpty,
  refetch = () => {},
  showLoadMore,
  isLoadingMore,
  handleLoadMore,
}: {
  threads?: Thread[];
  folderType?: string;
  emptyMessage?: React.ReactNode;
  hideActionBarWhenEmpty?: boolean;
  refetch?: (options?: { removedThreadIds?: string[] }) => void;
  showLoadMore?: boolean;
  isLoadingMore?: boolean;
  handleLoadMore?: () => void;
}) {
  const { emailAccountId, userEmail, provider } = useAccount();

  // if right panel is open
  const [openThreadId, setOpenThreadId] = useQueryState("thread-id");

  // Grouping on shows one row per conversation; off breaks a conversation
  // into a row per message, the way a classic mail client lists them
  const [groupParam, setGroupParam] = useQueryState("group", {
    defaultValue: "on",
  });
  const groupThreads = groupParam !== "off";
  const closePanel = useCallback(
    () => setOpenThreadId(null),
    [setOpenThreadId],
  );

  // Right-click on a row: filter builder, AI rule, or chat about the email
  const [rowMenu, setRowMenu] = useState<{
    x: number;
    y: number;
    thread: Thread;
  } | null>(null);
  const [filterThreads, setFilterThreads] = useState<Thread[] | null>(null);
  const [aiRuleThread, setAiRuleThread] = useState<Thread | null>(null);
  // Sparkles icon on a row: reprocess with the ask-before-move dialog
  const [reprocessThread, setReprocessThread] = useState<Thread | null>(null);
  const onRowContextMenu = useCallback(
    (event: React.MouseEvent, thread: Thread) => {
      setRowMenu({ x: event.clientX, y: event.clientY, thread });
    },
    [],
  );

  const { setInput } = useChat();
  const { setOpen: setOpenSidebars } = useSidebar();
  const chatAboutThread = useCallback(
    (thread: Thread) => {
      const message = thread.messages?.at(-1);
      if (!message) return;
      setInput(
        `About the email from ${message.headers.from} with the subject "${message.headers.subject}": `,
      );
      setOpenSidebars((sidebars) =>
        sidebars.includes("chat-sidebar")
          ? sidebars
          : [...sidebars, "chat-sidebar"],
      );
    },
    [setInput, setOpenSidebars],
  );

  const openedRow = useMemo(
    () => threads.find((thread) => thread.id === openThreadId),
    [openThreadId, threads],
  );

  // if checkbox for a row has been checked
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});

  const onSetSelectedRow = useCallback((id: string) => {
    setSelectedRows((s) => ({ ...s, [id]: !s[id] }));
  }, []);

  const isAllSelected = useMemo(
    () => threads.every((thread) => selectedRows[thread.id]),
    [threads, selectedRows],
  );

  const onToggleSelectAll = useCallback(() => {
    const newState = { ...selectedRows };
    for (const thread of threads) {
      newState[thread.id] = !isAllSelected;
    }
    setSelectedRows(newState);
  }, [threads, isAllSelected, selectedRows]);

  const undoSupported = isGoogleProvider(provider);

  const undoArchive = useCallback(
    async (threadIds: string[]) => {
      const results = await Promise.all(
        threadIds.map((threadId) =>
          unarchiveThreadAction(emailAccountId, { threadId }),
        ),
      );
      if (results.some((result) => result?.serverError)) {
        toast.error("There was an error undoing the archive :(");
      }
      refetch();
    },
    [emailAccountId, refetch],
  );

  const undoTrash = useCallback(
    async (threadIds: string[]) => {
      const results = await Promise.all(
        threadIds.map((threadId) =>
          untrashThreadAction(emailAccountId, { threadId }),
        ),
      );
      if (results.some((result) => result?.serverError)) {
        toast.error("There was an error undoing the delete :(");
      }
      refetch();
    },
    [emailAccountId, refetch],
  );

  const onArchive = useCallback(
    (thread: Thread) => {
      const threadIds = [thread.id];
      const toastId = toast.loading("Archiving...");
      archiveEmails({
        threadIds,
        onSuccess: () => {
          refetch({ removedThreadIds: threadIds });
          toast.success("Archived!", {
            id: toastId,
            action: undoSupported
              ? { label: "Undo", onClick: () => undoArchive(threadIds) }
              : undefined,
          });
        },
        onError: () =>
          toast.error("There was an error archiving the email :(", {
            id: toastId,
          }),
        emailAccountId,
      });
    },
    [refetch, emailAccountId, undoSupported, undoArchive],
  );

  const onDelete = useCallback(
    (thread: Thread) => {
      const threadIds = [thread.id];
      const toastId = toast.loading("Deleting...");
      deleteEmails({
        threadIds,
        onSuccess: () => {
          refetch({ removedThreadIds: threadIds });
          toast.success("Deleted!", {
            id: toastId,
            action: undoSupported
              ? { label: "Undo", onClick: () => undoTrash(threadIds) }
              : undefined,
          });
        },
        onError: () =>
          toast.error("There was an error deleting the email :(", {
            id: toastId,
          }),
        emailAccountId,
      });
    },
    [refetch, emailAccountId, undoSupported, undoTrash],
  );

  const listRef = useRef<HTMLDivElement>(null);

  // Threads interleaved with date group headers ("Today", "Yesterday", …)
  const rows = useMemo(
    () => buildDateGroupedRows(threads, groupThreads),
    [threads, groupThreads],
  );

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLLIElement>({
    count: rows.length,
    getScrollElement: () => listRef.current,
    // Cards are taller than the old flat rows and carry their own bottom gap;
    // dynamic measurement corrects these, they only need to be close
    estimateSize: (index) => (rows[index].kind === "header" ? 34 : 66),
    overscan: 10,
    getItemKey: (index) => rows[index].key,
  });

  // to scroll to a row when the side panel is opened
  function scrollToThread(threadId: string) {
    const index = rows.findIndex(
      (row) => row.kind === "thread" && row.thread.id === threadId,
    );
    if (index === -1) return;

    // let the panel open first
    setTimeout(() => {
      virtualizer.scrollToIndex(index, { align: "start" });
    }, 100);
  }

  function openThread(thread: Thread) {
    const alreadyOpen = !!openThreadId;
    setOpenThreadId(thread.id);

    if (!alreadyOpen) scrollToThread(thread.id);

    markReadThreads({
      threadIds: [thread.id],
      onSuccess: () => refetch(),
      emailAccountId,
    });
  }

  function advanceToAdjacentThread() {
    const openedRowIndex = threads.findIndex(
      (thread) => thread.id === openThreadId,
    );

    if (openedRowIndex === -1 || threads.length === 0 || threads.length === 1) {
      closePanel();
      return;
    }

    const rowIndex =
      openedRowIndex < threads.length - 1
        ? openedRowIndex + 1
        : openedRowIndex - 1;

    const prevOrNextRowId = threads[rowIndex].id;
    setOpenThreadId(prevOrNextRowId);
  }

  const onArchiveBulk = useCallback(async () => {
    const threadIds = Object.entries(selectedRows)
      .filter(([, selected]) => selected)
      .map(([id]) => id);
    const toastId = toast.loading("Archiving emails...");
    archiveEmails({
      threadIds,
      onSuccess: () => {
        setSelectedRows({});
        refetch({ removedThreadIds: threadIds });
        toast.success("Emails archived", {
          id: toastId,
          action: undoSupported
            ? { label: "Undo", onClick: () => undoArchive(threadIds) }
            : undefined,
        });
      },
      onError: () =>
        toast.error("There was an error archiving the emails :(", {
          id: toastId,
        }),
      emailAccountId,
    });
  }, [selectedRows, refetch, emailAccountId, undoSupported, undoArchive]);

  const onTrashBulk = useCallback(async () => {
    const threadIds = Object.entries(selectedRows)
      .filter(([, selected]) => selected)
      .map(([id]) => id);
    const toastId = toast.loading("Deleting emails...");
    deleteEmails({
      threadIds,
      onSuccess: () => {
        setSelectedRows({});
        refetch({ removedThreadIds: threadIds });
        toast.success("Emails deleted!", {
          id: toastId,
          action: undoSupported
            ? { label: "Undo", onClick: () => undoTrash(threadIds) }
            : undefined,
        });
      },
      onError: () =>
        toast.error("There was an error deleting the emails :(", {
          id: toastId,
        }),
      emailAccountId,
    });
  }, [selectedRows, refetch, emailAccountId, undoSupported, undoTrash]);

  // Bulk "Process with AI": one server action reprocesses every selected
  // thread — a fresh rule run plus the deterministic finalize that makes
  // the decision stick — resolving provider/rules/labels once and running
  // the threads with server-side concurrency (the old client loop fired
  // two serialized server actions per thread).
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  const onPlanAiBulk = useCallback(async () => {
    const selectedThreadIds = threads
      .filter((thread) => selectedRows[thread.id])
      .map((thread) => thread.id);
    if (!selectedThreadIds.length || isBulkProcessing) return;

    setIsBulkProcessing(true);
    const toastId = toast.loading(
      `Processing ${selectedThreadIds.length} email${selectedThreadIds.length === 1 ? "" : "s"} with AI…`,
    );

    try {
      const result = await bulkProcessThreadsAction(emailAccountId, {
        threadIds: selectedThreadIds,
      });
      if (result?.serverError || !result?.data) {
        toast.error(result?.serverError ?? "Couldn't process the emails.", {
          id: toastId,
        });
        return;
      }

      const { processed, failed } = result.data;
      if (failed) {
        toast.error(
          `Processed ${processed} of ${processed + failed} emails — ${failed} failed.`,
          { id: toastId },
        );
      } else {
        toast.success(
          `Processed ${processed} email${processed === 1 ? "" : "s"} with AI.`,
          { id: toastId },
        );
      }
      setSelectedRows({});
      refetch();
    } finally {
      setIsBulkProcessing(false);
    }
  }, [emailAccountId, selectedRows, threads, isBulkProcessing, refetch]);

  const isEmpty = threads.length === 0;
  const selectedCount = threads.filter(
    (thread) => selectedRows[thread.id],
  ).length;
  const threadRowCount = rows.filter((row) => row.kind === "thread").length;

  return (
    <>
      {!(isEmpty && hideActionBarWhenEmpty) && (
        <div className="flex items-center gap-3 px-4 pb-2 pt-3 sm:px-6">
          <Checkbox
            label={isAllSelected ? "Deselect all emails" : "Select all emails"}
            checked={isAllSelected}
            onChange={onToggleSelectAll}
          />
          <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
            {selectedCount > 0
              ? `${selectedCount} selected`
              : groupThreads
                ? `${threads.length} ${threads.length === 1 ? "conversation" : "conversations"}`
                : `${threadRowCount} ${threadRowCount === 1 ? "email" : "emails"}`}
          </span>
          <button
            type="button"
            className="inline-flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] border border-border px-2.5 text-[12.5px] text-muted-foreground hover:bg-muted"
            onClick={() => setGroupParam(groupThreads ? "off" : "on")}
          >
            Group by thread:{" "}
            <span className="font-medium text-foreground">
              {groupThreads ? "On" : "Off"}
            </span>
          </button>
        </div>
      )}

      {isEmpty ? (
        <div className="py-2">
          {typeof emptyMessage === "string" ? (
            <MessageText>{emptyMessage}</MessageText>
          ) : (
            emptyMessage
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden">
          <div
            className="h-full min-w-0 overflow-x-hidden overflow-y-auto scroll-smooth"
            ref={listRef}
          >
            <ul
              className="relative w-full"
              style={{ height: virtualizer.getTotalSize() }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];

                if (row.kind === "header") {
                  return (
                    <li
                      key={virtualRow.key}
                      ref={virtualizer.measureElement}
                      data-index={virtualRow.index}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      className="px-4 pb-1.5 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80 sm:px-6"
                    >
                      {row.label}
                    </li>
                  );
                }

                const thread = row.thread;

                return (
                  <EmailListItem
                    key={virtualRow.key}
                    ref={virtualizer.measureElement}
                    dataIndex={virtualRow.index}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    userEmail={userEmail}
                    provider={provider}
                    folderType={folderType}
                    thread={thread}
                    opened={openThreadId === thread.id}
                    closePanel={closePanel}
                    selected={selectedRows[thread.id]}
                    onSelected={onSetSelectedRow}
                    splitView={!!openThreadId}
                    onClick={() => openThread(thread)}
                    onReprocess={setReprocessThread}
                    onArchive={onArchive}
                    onDelete={onDelete}
                    onRowContextMenu={onRowContextMenu}
                    refetch={refetch}
                  />
                );
              })}
            </ul>
            {showLoadMore && (
              <div className="flex justify-center px-4 pb-4 pt-2 sm:px-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? (
                    <ButtonLoader />
                  ) : (
                    <ChevronsDownIcon className="mr-2 h-4 w-4" />
                  )}
                  <span>Load more</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* The open thread is a drawer at every width — the list keeps the
          full column behind it */}
      <Sheet
        open={!!(openThreadId && openedRow)}
        onOpenChange={(open) => !open && closePanel()}
      >
        <SheetContent
          side="right"
          className="w-full max-w-none p-0 sm:max-w-[640px] [&>button]:hidden"
        >
          <SheetTitle className="sr-only">Email</SheetTitle>
          {openedRow && (
            <EmailPanel
              key={openedRow.id}
              row={openedRow}
              folderType={folderType}
              onArchive={onArchive}
              advanceToAdjacentThread={advanceToAdjacentThread}
              close={closePanel}
              refetch={refetch}
            />
          )}
        </SheetContent>
      </Sheet>

      {selectedCount > 0 && (
        <BulkActionBar
          count={selectedCount}
          isProcessing={isBulkProcessing}
          onProcessAi={onPlanAiBulk}
          onMoveToFolder={() =>
            setFilterThreads(
              threads.filter((thread) => selectedRows[thread.id]),
            )
          }
          onArchive={onArchiveBulk}
          onDelete={onTrashBulk}
          onClear={() => setSelectedRows({})}
        />
      )}

      {rowMenu && (
        <RowContextMenu
          position={rowMenu}
          onClose={() => setRowMenu(null)}
          items={[
            {
              label: "Open",
              icon: ExternalLinkIcon,
              onClick: () => openThread(rowMenu.thread),
            },
            {
              label: "Process with AI",
              icon: SparklesIcon,
              onClick: () => setReprocessThread(rowMenu.thread),
            },
            {
              label: "Move to folder & train…",
              icon: FolderInputIcon,
              onClick: () => setFilterThreads([rowMenu.thread]),
            },
            {
              label: "Create rule with AI…",
              icon: WandSparklesIcon,
              onClick: () => setAiRuleThread(rowMenu.thread),
            },
            {
              label: "Chat with AI about this",
              icon: MessageCircleIcon,
              onClick: () => chatAboutThread(rowMenu.thread),
            },
            { divider: true },
            {
              label: "Archive",
              icon: ArchiveIcon,
              onClick: () => onArchive(rowMenu.thread),
            },
            {
              label: "Delete",
              icon: Trash2Icon,
              destructive: true,
              onClick: () => onDelete(rowMenu.thread),
            },
          ]}
        />
      )}
      {reprocessThread && (
        <ReprocessEmailDialog
          thread={reprocessThread}
          folderType={folderType}
          onClose={() => setReprocessThread(null)}
          refetch={refetch}
        />
      )}

      {filterThreads?.length ? (
        <FilterLikeThisDialog
          key={filterThreads.map((thread) => thread.id).join(",")}
          threads={filterThreads}
          onClose={() => setFilterThreads(null)}
          refetch={() => {
            setSelectedRows({});
            refetch();
          }}
        />
      ) : null}
      {aiRuleThread && (
        <AiRuleFromEmailDialog
          key={aiRuleThread.id}
          thread={aiRuleThread}
          onClose={() => setAiRuleThread(null)}
          refetch={() => refetch()}
        />
      )}
    </>
  );
}

type ListRow =
  | { kind: "header"; key: string; label: string }
  | { kind: "thread"; key: string; thread: Thread };

// Threads arrive newest-first; insert a header row whenever the date bucket
// changes (Today, Yesterday, then calendar dates).
//
// With grouping off, every message becomes its own row. The messages are
// already in hand — the API returns whole threads — so this is a client-side
// expansion, re-sorted globally by date because a thread's older messages
// would otherwise land under the newer thread's date header.
function buildDateGroupedRows(threads: Thread[], grouped: boolean): ListRow[] {
  const entries: { key: string; thread: Thread; date: Date | undefined }[] = [];

  for (const thread of threads) {
    const messages = thread.messages ?? [];

    if (grouped || messages.length <= 1) {
      entries.push({
        key: thread.id,
        thread,
        date: internalDateToDate(messages.at(-1)?.internalDate),
      });
      continue;
    }

    for (const message of messages) {
      entries.push({
        // Selection and opening stay keyed to the thread; only the row
        // identity has to be unique per message
        key: `${thread.id}:${message.id}`,
        thread: { ...thread, messages: [message], snippet: message.snippet },
        date: internalDateToDate(message.internalDate),
      });
    }
  }

  if (!grouped) {
    entries.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
  }

  const rows: ListRow[] = [];
  let currentLabel: string | null = null;

  for (const entry of entries) {
    const label = dateBucketLabel(entry.date);
    if (label !== currentLabel) {
      currentLabel = label;
      rows.push({ kind: "header", key: `header-${label}`, label });
    }
    rows.push({ kind: "thread", key: entry.key, thread: entry.thread });
  }

  return rows;
}

function dateBucketLabel(date: Date | undefined): string {
  if (!date) return "Earlier";

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfYesterday = new Date(
    startOfToday.getTime() - 24 * 60 * 60 * 1000,
  );

  if (date >= startOfToday) return "Today";
  if (date >= startOfYesterday) return "Yesterday";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}
