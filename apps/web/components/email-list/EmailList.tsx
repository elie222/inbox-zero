"use client";

import { useCallback, useRef, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import countBy from "lodash/countBy";
import { capitalCase } from "capital-case";
import Link from "next/link";
import { toast } from "sonner";
import { useAtom } from "jotai";
import { ChevronsDownIcon } from "lucide-react";
import { ActionButtonsBulk } from "@/components/ActionButtonsBulk";
import { Celebration } from "@/components/Celebration";
import { isActionError } from "@/utils/error";
import { useSession } from "next-auth/react";
import { EmailPanel } from "@/components/email-list/EmailPanel";
import type { Thread } from "@/components/email-list/types";
import { useExecutePlan } from "@/components/email-list/PlanActions";
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
import { selectedEmailAtom } from "@/store/email";
import { categorizeEmailAction } from "@/utils/actions/categorize-email";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
import {
  archiveEmails,
  deleteEmails,
  markReadThreads,
} from "@/store/archive-queue";

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
  refetch: (removedThreadIds?: string[]) => void;
  showLoadMore?: boolean;
  isLoadingMore?: boolean;
  handleLoadMore?: () => void;
}) {
  const params = useSearchParams();
  const selectedTab = params.get("tab") || "all";

  const categories = useMemo(() => {
    return countBy(
      emails,
      (email) => email.category?.category || "Uncategorized",
    );
  }, [emails]);

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
      ...Object.entries(categories).map(([category, count]) => ({
        label: `${capitalCase(category)} (${count})`,
        value: category,
        href: `/mail?tab=${category}`,
      })),
    ],
    [categories, planned],
  );

  // only show tabs if there are planned emails or categorized emails
  const showTabs = !!(planned.length || emails.find((email) => email.category));

  const filteredEmails = useMemo(() => {
    if (selectedTab === "planned") return planned;

    if (selectedTab === "all") return emails;

    if (selectedTab === "Uncategorized")
      return emails.filter((email) => !email.category?.category);

    return emails.filter((email) => email.category?.category === selectedTab);
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
                        href="/automation"
                        className="font-semibold hover:underline"
                      >
                        Automation page
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
          <Celebration
            message={
              type === "inbox"
                ? "You made it to Inbox Zero!"
                : "All emails handled!"
            }
          />
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
  refetch?: (removedThreadIds?: string[]) => void;
  showLoadMore?: boolean;
  isLoadingMore?: boolean;
  handleLoadMore?: () => void;
}) {
  const session = useSession();
  // if right panel is open
  const [openedRowId, setOpenedRowId] = useAtom(selectedEmailAtom);
  const closePanel = useCallback(
    () => setOpenedRowId(undefined),
    [setOpenedRowId],
  );

  const openedRow = useMemo(
    () => threads.find((thread) => thread.id === openedRowId),
    [openedRowId, threads],
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

  const [isCategorizing, setIsCategorizing] = useState<Record<string, boolean>>(
    {},
  );

  const onPlanAiAction = useCallback((thread: Thread) => {
    toast.promise(() => runAiRules([thread], true), {
      success: "Running...",
      error: "There was an error running the AI rules :(",
    });
  }, []);

  const onAiCategorize = useCallback(
    (thread: Thread) => {
      toast.promise(
        async () => {
          setIsCategorizing((s) => ({ ...s, [thread.id]: true }));

          // categorizing by first message for threads
          const message = thread.messages?.[0];

          if (!message) return;

          const result = await categorizeEmailAction({
            from: message.headers.from,
            subject: message.headers.subject,
            textPlain: message.textPlain || null,
            textHtml: message.textHtml || null,
            snippet: thread.snippet,
            threadId: message.threadId || "",
            date: message.headers.date || "",
          });

          if (isActionError(result)) {
            setIsCategorizing((s) => ({ ...s, [thread.id]: false }));
            throw new Error("There was an error categorizing the email.");
          }
          if (!result) {
            throw new Error("The request did not complete");
          }
          // setCategory(res);
          refetch();
          setIsCategorizing((s) => ({ ...s, [thread.id]: false }));

          return result?.category;
        },
        {
          loading: "Categorizing...",
          success: (category) =>
            `Categorized as ${capitalCase(category || "Unknown")}!`,
          error: "There was an error categorizing the email :(",
        },
      );
    },
    [refetch],
  );

  const onArchive = useCallback(
    (thread: Thread) => {
      const threadIds = [thread.id];
      toast.promise(
        async () => {
          await new Promise<void>((resolve, reject) => {
            archiveEmails(
              threadIds,
              undefined,
              (threadId) => {
                refetch([threadId]);
                resolve();
              },
              reject,
            );
          });
        },
        {
          loading: "Archiving...",
          success: "Archived!",
          error: "There was an error archiving the email :(",
        },
      );
    },
    [refetch],
  );

  const listRef = useRef<HTMLUListElement>(null);
  const itemsRef = useRef<Map<string, HTMLLIElement> | null>(null);

  // https://react.dev/learn/manipulating-the-dom-with-refs#how-to-manage-a-list-of-refs-using-a-ref-callback
  function getMap() {
    if (!itemsRef.current) {
      // Initialize the Map on first usage.
      itemsRef.current = new Map();
    }
    return itemsRef.current;
  }

  // to scroll to a row when the side panel is opened
  function scrollToId(threadId: string) {
    const map = getMap();
    const node = map.get(threadId);

    // let the panel open first
    setTimeout(() => {
      if (listRef.current && node) {
        // Calculate the position of the item relative to the container
        const topPos = node.offsetTop - 117;

        // Scroll the container to the item
        listRef.current.scrollTop = topPos;
      }
    }, 100);
  }

  const { executingPlan, rejectingPlan, executePlan, rejectPlan } =
    useExecutePlan(refetch);

  const onApplyAction = useCallback(
    async (action: (thread: Thread) => void) => {
      for (const [threadId, selected] of Object.entries(selectedRows)) {
        if (!selected) continue;
        const thread = threads.find((t) => t.id === threadId);
        if (thread) action(thread);
      }
      refetch();
    },
    [threads, selectedRows, refetch],
  );

  const onCategorizeAiBulk = useCallback(async () => {
    onApplyAction(onAiCategorize);
  }, [onApplyAction, onAiCategorize]);
  const onAiApproveBulk = useCallback(async () => {
    onApplyAction(executePlan);
  }, [onApplyAction, executePlan]);
  const onAiRejectBulk = useCallback(async () => {
    onApplyAction(rejectPlan);
  }, [onApplyAction, rejectPlan]);

  const onArchiveBulk = useCallback(async () => {
    toast.promise(
      async () => {
        const threadIds = Object.entries(selectedRows)
          .filter(([, selected]) => selected)
          .map(([id]) => id);

        await new Promise<void>((resolve, reject) => {
          archiveEmails(
            threadIds,
            undefined,
            () => {
              refetch(threadIds);
              resolve();
            },
            reject,
          );
        });
      },
      {
        loading: "Archiving emails...",
        success: "Emails archived",
        error: "There was an error archiving the emails :(",
      },
    );
  }, [selectedRows, refetch]);

  const onTrashBulk = useCallback(async () => {
    toast.promise(
      async () => {
        const threadIds = Object.entries(selectedRows)
          .filter(([, selected]) => selected)
          .map(([id]) => id);

        await new Promise<void>((resolve, reject) => {
          deleteEmails(
            threadIds,
            () => {
              refetch(threadIds);
              resolve();
            },
            reject,
          );
        });
      },
      {
        loading: "Deleting emails...",
        success: "Emails deleted!",
        error: "There was an error deleting the emails :(",
      },
    );
  }, [selectedRows, refetch]);

  const onPlanAiBulk = useCallback(async () => {
    toast.promise(
      async () => {
        const selectedThreads = Object.entries(selectedRows)
          .filter(([, selected]) => selected)
          .map(([id]) => threads.find((t) => t.id === id)!);

        runAiRules(selectedThreads, false);
        // runAiRules(threadIds, () => refetch(threadIds));
      },
      {
        success: "Running AI rules...",
        error: "There was an error running the AI rules :(",
      },
    );
  }, [selectedRows, threads]);

  const isEmpty = threads.length === 0;

  return (
    <>
      {!(isEmpty && hideActionBarWhenEmpty) && (
        <div className="flex items-center divide-gray-100 border-b border-l-4 bg-white px-4 py-1">
          <div className="pl-1">
            <Checkbox checked={isAllSelected} onChange={onToggleSelectAll} />
          </div>
          <div className="ml-2">
            <ActionButtonsBulk
              isPlanning={false}
              isCategorizing={false}
              isArchiving={false}
              isDeleting={false}
              isApproving={false}
              isRejecting={false}
              onAiCategorize={onCategorizeAiBulk}
              onPlanAiAction={onPlanAiBulk}
              onArchive={onArchiveBulk}
              onDelete={onTrashBulk}
              onApprove={onAiApproveBulk}
              onReject={onAiRejectBulk}
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
            <ul
              className="divide-y divide-gray-100 overflow-y-auto scroll-smooth"
              ref={listRef}
            >
              {threads.map((thread) => {
                const onOpen = () => {
                  const alreadyOpen = !!openedRowId;
                  setOpenedRowId(thread.id);

                  if (!alreadyOpen) scrollToId(thread.id);

                  markReadThreads([thread.id], () => refetch([thread.id]));
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
                    userEmailAddress={session.data?.user.email || ""}
                    thread={thread}
                    opened={openedRowId === thread.id}
                    closePanel={closePanel}
                    selected={selectedRows[thread.id]}
                    onSelected={onSetSelectedRow}
                    splitView={!!openedRowId}
                    onClick={onOpen}
                    isCategorizing={isCategorizing[thread.id]}
                    onPlanAiAction={onPlanAiAction}
                    onAiCategorize={onAiCategorize}
                    onArchive={onArchive}
                    executePlan={executePlan}
                    rejectPlan={rejectPlan}
                    executingPlan={executingPlan[thread.id]}
                    rejectingPlan={rejectingPlan[thread.id]}
                    refetch={refetch}
                  />
                );
              })}
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
            </ul>
          }
          right={
            !!(openedRowId && openedRow) && (
              <EmailPanel
                row={openedRow}
                isCategorizing={isCategorizing[openedRowId]}
                onPlanAiAction={onPlanAiAction}
                onAiCategorize={onAiCategorize}
                onArchive={onArchive}
                close={closePanel}
                executePlan={executePlan}
                rejectPlan={rejectPlan}
                executingPlan={executingPlan[openedRowId]}
                rejectingPlan={rejectingPlan[openedRowId]}
                refetch={refetch}
              />
            )
          }
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
  if (!right) return left;

  return (
    <ResizablePanelGroup direction="horizontal">
      <ResizablePanel
        style={{ overflow: "auto" }}
        defaultSize={50}
        minSize={30}
      >
        {left}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={50} minSize={30}>
        {right}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
