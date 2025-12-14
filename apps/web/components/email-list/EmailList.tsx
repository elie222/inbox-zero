"use client";

import { useCallback, useRef, useState, useMemo, memo } from "react";
import { useQueryState } from "nuqs";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronsDownIcon } from "lucide-react";
import { VList, type VListHandle } from "virtua";
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
import { prefixPath } from "@/utils/path";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/utils";

export function List({
  emails,
  type,
  refetch,
  showLoadMore,
  isLoadingMore,
  handleLoadMore,
}: {
  emails: Thread[];
  type?: string;
  refetch: (options?: { removedThreadIds?: string[] }) => void;
  showLoadMore?: boolean;
  isLoadingMore?: boolean;
  handleLoadMore?: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [selectedTab] = useQueryState("tab", { defaultValue: "all" });

  const planned = useMemo(() => {
    return emails.filter((email) => email.plan?.rule);
  }, [emails]);

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
        <div className="border-b border-gray-200">
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
          {type === "inbox" ? (
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
  emptyMessage,
  hideActionBarWhenEmpty,
  refetch = () => {},
  showLoadMore,
  isLoadingMore,
  handleLoadMore,
}: {
  threads?: Thread[];
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

  const openedRow = useMemo(
    () => threads.find((thread) => thread.id === openThreadId),
    [openThreadId, threads],
  );

  // if checkbox for a row has been checked
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});

  const onSetSelectedRow = useCallback((id: string) => {
    setSelectedRows((s) => ({ ...s, [id]: !s[id] }));
  }, []);

  const isAllSelected = useMemo(() => {
    return threads.every((thread) => selectedRows[thread.id]);
  }, [threads, selectedRows]);

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

  const onArchive = useCallback(
    (thread: Thread) => {
      const threadIds = [thread.id];
      toast.promise(
        async () => {
          await new Promise<void>((resolve, reject) => {
            archiveEmails({
              threadIds,
              onSuccess: () => {
                refetch({ removedThreadIds: [thread.id] });
                resolve();
              },
              onError: reject,
              emailAccountId,
            });
          });
        },
        {
          loading: "Archiving...",
          success: "Archived!",
          error: "There was an error archiving the email :(",
        },
      );
    },
    [refetch, emailAccountId],
  );

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
    toast.promise(
      async () => {
        const threadIds = Object.entries(selectedRows)
          .filter(([, selected]) => selected)
          .map(([id]) => id);

        await new Promise<void>((resolve, reject) => {
          archiveEmails({
            threadIds,
            onSuccess: () => {
              refetch({ removedThreadIds: threadIds });
              resolve();
            },
            onError: reject,
            emailAccountId,
          });
        });
      },
      {
        loading: "Archiving emails...",
        success: "Emails archived",
        error: "There was an error archiving the emails :(",
      },
    );
  }, [selectedRows, refetch, emailAccountId]);

  const onTrashBulk = useCallback(async () => {
    toast.promise(
      async () => {
        const threadIds = Object.entries(selectedRows)
          .filter(([, selected]) => selected)
          .map(([id]) => id);

        await new Promise<void>((resolve, reject) => {
          deleteEmails({
            threadIds,
            onSuccess: () => {
              refetch({ removedThreadIds: threadIds });
              resolve();
            },
            onError: reject,
            emailAccountId,
          });
        });
      },
      {
        loading: "Deleting emails...",
        success: "Emails deleted!",
        error: "There was an error deleting the emails :(",
      },
    );
  }, [selectedRows, refetch, emailAccountId]);

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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {!(isEmpty && hideActionBarWhenEmpty) && (
        <div className="flex shrink-0 items-center border-b border-l-4 border-border bg-background px-4 py-1">
          <div className="pl-1">
            <Checkbox checked={isAllSelected} onChange={onToggleSelectAll} />
          </div>
          <div className="ml-2">
            <ActionButtonsBulk
              isPlanning={false}
              isArchiving={false}
              isDeleting={false}
              onPlanAiAction={onPlanAiBulk}
              onArchive={onArchiveBulk}
              onDelete={onTrashBulk}
            />
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

      <div className="flex-1 overflow-hidden">
        {isEmpty ? (
          <div className="py-2">
            {typeof emptyMessage === "string" ? (
              <MessageText>{emptyMessage}</MessageText>
            ) : (
              emptyMessage
            )}
          </div>
        ) : (
          <ResizeGroup
            left={
              <VirtualEmailList
                threads={threads}
                openThreadId={openThreadId}
                setOpenThreadId={setOpenThreadId}
                selectedRows={selectedRows}
                onSetSelectedRow={onSetSelectedRow}
                onPlanAiAction={onPlanAiAction}
                onArchive={onArchive}
                refetch={refetch}
                showLoadMore={showLoadMore}
                isLoadingMore={isLoadingMore}
                handleLoadMore={handleLoadMore}
                userEmail={userEmail}
                provider={provider}
                emailAccountId={emailAccountId}
                closePanel={closePanel}
              />
            }
            right={
              !!(openThreadId && openedRow) && (
                <EmailPanel
                  row={openedRow}
                  onPlanAiAction={onPlanAiAction}
                  onArchive={onArchive}
                  advanceToAdjacentThread={advanceToAdjacentThread}
                  close={closePanel}
                  refetch={refetch}
                />
              )
            }
          />
        )}
      </div>
    </div>
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

  return (
    <ResizablePanelGroup
      direction={isMobile ? "vertical" : "horizontal"}
      style={{ overflow: "hidden" }}
    >
      <ResizablePanel
        style={{ overflow: "hidden" }}
        defaultSize={50}
        minSize={0}
      >
        <div style={{ height: "100%", overflow: "hidden" }}>{left}</div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel
        style={{ overflow: "hidden" }}
        defaultSize={50}
        minSize={0}
      >
        {right}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

/**
 * VirtualEmailList - High-performance email list using Virtua for virtual scrolling
 * Renders only visible items for 60fps performance with large email lists
 */
const VirtualEmailList = memo(function VirtualEmailList({
  threads,
  openThreadId,
  setOpenThreadId,
  selectedRows,
  onSetSelectedRow,
  onPlanAiAction,
  onArchive,
  refetch,
  showLoadMore,
  isLoadingMore,
  handleLoadMore,
  userEmail,
  provider,
  emailAccountId,
  closePanel,
}: {
  threads: Thread[];
  openThreadId: string | null;
  setOpenThreadId: (id: string | null) => void;
  selectedRows: Record<string, boolean>;
  onSetSelectedRow: (id: string) => void;
  onPlanAiAction: (thread: Thread) => void;
  onArchive: (thread: Thread) => void;
  refetch: (options?: { removedThreadIds?: string[] }) => void;
  showLoadMore?: boolean;
  isLoadingMore?: boolean;
  handleLoadMore?: () => void;
  userEmail: string;
  provider?: string;
  emailAccountId: string;
  closePanel: () => void;
}) {
  const vListRef = useRef<VListHandle>(null);
  const itemsRef = useRef<Map<string, HTMLLIElement> | null>(null);

  function getMap() {
    if (!itemsRef.current) {
      itemsRef.current = new Map();
    }
    return itemsRef.current;
  }

  // Handle scroll to load more when near the end
  const handleScroll = useCallback(
    (offset: number) => {
      if (
        !vListRef.current ||
        !handleLoadMore ||
        isLoadingMore ||
        !showLoadMore
      )
        return;

      // Calculate end index using offset + viewportSize
      const { viewportSize } = vListRef.current;
      const endIndex = vListRef.current.findItemIndex(offset + viewportSize);

      // Load more when we're within 5 items of the end
      if (threads.length - 1 - endIndex < 5) {
        handleLoadMore();
      }
    },
    [handleLoadMore, isLoadingMore, showLoadMore, threads.length],
  );

  // Scroll to a specific thread
  const scrollToIndex = useCallback((index: number) => {
    if (vListRef.current) {
      vListRef.current.scrollToIndex(index, { align: "start" });
    }
  }, []);

  // Render each email item - receives (thread, index) from VList data prop
  const renderItem = useCallback(
    (thread: Thread, index: number): React.ReactElement => {
      const onOpen = () => {
        const alreadyOpen = !!openThreadId;
        setOpenThreadId(thread.id);

        if (!alreadyOpen) {
          // Scroll to the item after a short delay to allow panel to open
          setTimeout(() => scrollToIndex(index), 100);
        }

        markReadThreads({
          threadIds: [thread.id],
          onSuccess: () => refetch(),
          emailAccountId,
        });
      };

      return (
        <EmailListItem
          key={thread.id}
          ref={(node) => {
            const map = getMap();
            if (node) {
              map.set(thread.id, node);
            } else {
              map.delete(thread.id);
            }
          }}
          userEmail={userEmail}
          provider={provider ?? ""}
          thread={thread}
          opened={openThreadId === thread.id}
          closePanel={closePanel}
          selected={selectedRows[thread.id]}
          onSelected={onSetSelectedRow}
          splitView={!!openThreadId}
          onClick={onOpen}
          onPlanAiAction={onPlanAiAction}
          onArchive={onArchive}
          refetch={refetch}
        />
      );
    },
    [
      openThreadId,
      setOpenThreadId,
      selectedRows,
      onSetSelectedRow,
      onPlanAiAction,
      onArchive,
      refetch,
      userEmail,
      provider,
      emailAccountId,
      closePanel,
      scrollToIndex,
    ],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Standard scrollable list */}
      <ul className="flex-1 divide-y divide-border overflow-y-auto overflow-x-hidden style-scrollbar">
        {threads.map((thread, index) => renderItem(thread, index))}
      </ul>

      {/* Load more indicator */}
      {showLoadMore && (
        <div className="flex-shrink-0 border-t border-border p-2">
          <Button
            variant="outline"
            className="w-full"
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

      {/* Loading indicator at bottom */}
      {isLoadingMore && (
        <div className="flex justify-center py-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
    </div>
  );
});
