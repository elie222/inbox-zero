"use client";

import { useCallback, useRef, useState, useMemo } from "react";
import { useQueryState } from "nuqs";
import { useVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { toast } from "sonner";
import {
  ChevronsDownIcon,
  FilterIcon,
  MessageCircleIcon,
  SparklesIcon,
} from "lucide-react";
import { ActionButtonsBulk } from "@/components/ActionButtonsBulk";
import { Celebration } from "@/components/Celebration";
import { EmailPanel } from "@/components/email-list/EmailPanel";
import type { Thread } from "@/components/email-list/types";
import { Tabs } from "@/components/Tabs";
import { GroupHeading } from "@/components/GroupHeading";
import { Checkbox } from "@/components/Checkbox";
import { MessageText } from "@/components/Typography";
import { AlertBasic } from "@/components/Alert";
import { EmailListItem } from "@/components/email-list/EmailListItem";
import { FolderHeader } from "@/components/email-list/FolderSettings";
import { RowContextMenu } from "@/components/email-list/RowContextMenu";
import { FilterLikeThisDialog } from "@/components/email-list/FilterLikeThisDialog";
import { AiRuleFromEmailDialog } from "@/components/email-list/AiRuleFromEmailDialog";
import { useChat } from "@/providers/ChatProvider";
import { useSidebar } from "@/components/ui/sidebar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { runAiRules } from "@/utils/queue/email-actions";
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
import { useIsMobile } from "@/hooks/use-mobile";
import {
  unarchiveThreadAction,
  untrashThreadAction,
} from "@/utils/actions/mail";
import { isGoogleProvider } from "@/utils/email/provider-types";

const VIEW_TITLES: Record<string, string> = {
  inbox: "Inbox",
  draft: "Drafts",
  sent: "Sent",
  archive: "Archived",
};

export function List({
  emails,
  type,
  labelId,
  searchQuery,
  refetch,
  showLoadMore,
  isLoadingMore,
  handleLoadMore,
}: {
  emails: Thread[];
  type?: string;
  labelId?: string;
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
      {type === "label" && labelId ? (
        <FolderHeader labelId={labelId} />
      ) : (
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <h1 className="font-display text-2xl tracking-tight">
            {VIEW_TITLES[type ?? "inbox"] ?? "Inbox"}
          </h1>
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

  const onPlanAiAction = useCallback(
    (thread: Thread) => {
      toast.promise(() => runAiRules(emailAccountId, [thread], true), {
        success: "Running...",
        error: "There was an error running the AI rules :(",
      });
    },
    [emailAccountId],
  );

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
  const rows = useMemo(() => buildDateGroupedRows(threads), [threads]);

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLLIElement>({
    count: rows.length,
    getScrollElement: () => listRef.current,
    estimateSize: (index) => (rows[index].kind === "header" ? 33 : 76),
    overscan: 10,
    getItemKey: (index) => {
      const row = rows[index];
      return row.kind === "header" ? row.key : row.thread.id;
    },
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

  const onPlanAiBulk = useCallback(async () => {
    toast.promise(
      async () => {
        const selectedThreads = Object.entries(selectedRows)
          .filter(([, selected]) => selected)
          .map(([id]) => threads.find((t) => t.id === id)!);

        runAiRules(emailAccountId, selectedThreads, false);
        // runAiRules(threadIds, () => refetch(threadIds));
      },
      {
        success: "Running AI rules...",
        error: "There was an error running the AI rules :(",
      },
    );
  }, [emailAccountId, selectedRows, threads]);

  const isEmpty = threads.length === 0;
  const selectedCount = threads.filter(
    (thread) => selectedRows[thread.id],
  ).length;

  return (
    <>
      {!(isEmpty && hideActionBarWhenEmpty) && (
        <div className="flex items-center border-b border-l-4 border-border bg-background px-4 py-1">
          <div className="pl-1">
            <Checkbox
              label={
                isAllSelected ? "Deselect all emails" : "Select all emails"
              }
              checked={isAllSelected}
              onChange={onToggleSelectAll}
            />
          </div>
          <div className="ml-2 flex items-center gap-1">
            <ActionButtonsBulk
              isPlanning={false}
              isArchiving={false}
              isDeleting={false}
              onPlanAiAction={onPlanAiBulk}
              onArchive={onArchiveBulk}
              onDelete={onTrashBulk}
            />
            {selectedCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setFilterThreads(
                    threads.filter((thread) => selectedRows[thread.id]),
                  )
                }
              >
                <FilterIcon className="mr-1.5 size-3.5" />
                Filter selected ({selectedCount})
              </Button>
            )}
          </div>
          {/* <div className="ml-auto gap-1 flex items-center">
            <Button variant="ghost" size='icon'>
              <ChevronLeftIcon className='h-4 w-4' />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost">Today</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>All</DropdownMenuItem>
                <DropdownMenuItem>Today</DropdownMenuItem>
                <DropdownMenuItem>Yesterday</DropdownMenuItem>
                <DropdownMenuItem>Last week</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size='icon'>
              <ChevronRightIcon className='h-4 w-4' />
            </Button>
          </div> */}
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
          <ResizeGroup
            left={
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
                          className="border-b border-border bg-background px-4 py-2 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70"
                        >
                          {row.label}
                        </li>
                      );
                    }

                    const thread = row.thread;

                    const onOpen = () => {
                      const alreadyOpen = !!openThreadId;
                      setOpenThreadId(thread.id);

                      if (!alreadyOpen) scrollToThread(thread.id);

                      markReadThreads({
                        threadIds: [thread.id],
                        onSuccess: () => refetch(),
                        emailAccountId,
                      });
                    };

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
                        onClick={onOpen}
                        onPlanAiAction={onPlanAiAction}
                        onArchive={onArchive}
                        onDelete={onDelete}
                        onRowContextMenu={onRowContextMenu}
                        refetch={refetch}
                      />
                    );
                  })}
                </ul>
                {showLoadMore && (
                  <Button
                    variant="outline"
                    className="mb-2 w-full"
                    size={"sm"}
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                  >
                    {
                      <>
                        {isLoadingMore ? (
                          <ButtonLoader />
                        ) : (
                          <ChevronsDownIcon className="mr-2 h-4 w-4" />
                        )}
                        <span>Load more</span>
                      </>
                    }
                  </Button>
                )}
              </div>
            }
            right={
              !!(openThreadId && openedRow) && (
                <EmailPanel
                  row={openedRow}
                  folderType={folderType}
                  onPlanAiAction={onPlanAiAction}
                  onArchive={onArchive}
                  advanceToAdjacentThread={advanceToAdjacentThread}
                  close={closePanel}
                  refetch={refetch}
                />
              )
            }
          />
        </div>
      )}

      {rowMenu && (
        <RowContextMenu
          position={rowMenu}
          onClose={() => setRowMenu(null)}
          items={[
            {
              label: "Filter messages like this…",
              icon: FilterIcon,
              onClick: () => setFilterThreads([rowMenu.thread]),
            },
            {
              label: "Create rule with AI…",
              icon: SparklesIcon,
              onClick: () => setAiRuleThread(rowMenu.thread),
            },
            {
              label: "Chat with AI about this",
              icon: MessageCircleIcon,
              onClick: () => chatAboutThread(rowMenu.thread),
            },
          ]}
        />
      )}
      {filterThreads?.length ? (
        <FilterLikeThisDialog
          key={filterThreads.map((thread) => thread.id).join(",")}
          threads={filterThreads}
          onClose={() => setFilterThreads(null)}
          refetch={() => refetch()}
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

function ResizeGroup({
  left,
  right,
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
}) {
  const isMobile = useIsMobile();

  if (!right) return left;

  // On mobile a split view leaves both halves cramped; show the open thread
  // full-screen instead. Its close button returns to the list.
  if (isMobile) return <div className="h-full overflow-y-auto">{right}</div>;

  return (
    <ResizablePanelGroup direction="horizontal">
      <ResizablePanel
        style={{ overflow: "auto" }}
        defaultSize={50}
        minSize={0}
        className="min-w-0"
      >
        {left}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={50} minSize={0} className="min-w-0">
        {right}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

type ListRow =
  | { kind: "header"; key: string; label: string }
  | { kind: "thread"; thread: Thread };

// Threads arrive newest-first; insert a header row whenever the date bucket
// changes (Today, Yesterday, then calendar dates)
function buildDateGroupedRows(threads: Thread[]): ListRow[] {
  const rows: ListRow[] = [];
  let currentLabel: string | null = null;

  for (const thread of threads) {
    const lastMessage = thread.messages?.at(-1);
    const date = internalDateToDate(lastMessage?.internalDate);
    const label = dateBucketLabel(date);

    if (label !== currentLabel) {
      currentLabel = label;
      rows.push({ kind: "header", key: `header-${label}`, label });
    }
    rows.push({ kind: "thread", thread });
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
