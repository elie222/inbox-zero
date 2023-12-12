import { useCallback, useRef, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import countBy from "lodash/countBy";
import { capitalCase } from "capital-case";
import Link from "next/link";
import { toast } from "sonner";
import { ActionButtonsBulk } from "@/components/ActionButtonsBulk";
import { Celebration } from "@/components/Celebration";
import { postRequest } from "@/utils/api";
import { isError } from "@/utils/error";
import { useSession } from "next-auth/react";
import { ActResponse } from "@/app/api/ai/act/controller";
import { ActBodyWithHtml } from "@/app/api/ai/act/validation";
import { EmailPanel } from "@/components/email-list/EmailPanel";
import { type Thread } from "@/components/email-list/types";
import { useExecutePlan } from "@/components/email-list/PlanActions";
import { Tabs } from "@/components/Tabs";
import { GroupHeading } from "@/components/GroupHeading";
import { CategoriseResponse } from "@/app/api/ai/categorise/controller";
import { CategoriseBodyWithHtml } from "@/app/api/ai/categorise/validation";
import { Checkbox } from "@/components/Checkbox";
import {
  ArchiveBody,
  ArchiveResponse,
} from "@/app/api/google/threads/archive/controller";
import { MessageText } from "@/components/Typography";
import { AlertBasic } from "@/components/Alert";
import { EmailListItem } from "@/components/email-list/EmailListItem";

export function List(props: { emails: Thread[]; refetch: () => void }) {
  const { emails, refetch } = props;

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

  const filteredEmails = useMemo(() => {
    if (selectedTab === "planned") return planned;

    if (selectedTab === "all") return emails;

    if (selectedTab === "Uncategorized")
      return emails.filter((email) => !email.category?.category);

    return emails.filter((email) => email.category?.category === selectedTab);
  }, [emails, selectedTab, planned]);

  return (
    <>
      <div className="border-b border-gray-200">
        <GroupHeading
          leftContent={
            <div className="overflow-x-auto py-2 md:max-w-lg lg:max-w-xl xl:max-w-3xl 2xl:max-w-4xl">
              <Tabs selected={selectedTab} tabs={tabs} breakpoint="xs" />
            </div>
          }
        />
      </div>
      {emails.length ? (
        <EmailList
          threads={filteredEmails}
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
        <Celebration />
      )}
    </>
  );
}

export function EmailList(props: {
  threads?: Thread[];
  emptyMessage?: React.ReactNode;
  hideActionBarWhenEmpty?: boolean;
  refetch: () => void;
}) {
  const { threads = [], emptyMessage, hideActionBarWhenEmpty, refetch } = props;

  const session = useSession();

  // if right panel is open
  const [openedRowId, setOpenedRowId] = useState<string>();
  const closePanel = useCallback(() => setOpenedRowId(undefined), []);

  const openedRow = useMemo(
    () => threads.find((thread) => thread.id === openedRowId),
    [openedRowId, threads],
  );

  // if checkbox for a row has been checked
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});

  const onSetSelectedRow = useCallback(
    (id: string) => {
      setSelectedRows((s) => ({ ...s, [id]: !s[id] }));
    },
    [setSelectedRows],
  );

  const isAllSelected = useMemo(() => {
    return threads.every((thread) => selectedRows[thread.id!]);
  }, [threads, selectedRows]);

  const onToggleSelectAll = useCallback(() => {
    threads.forEach((thread) => {
      setSelectedRows((s) => ({ ...s, [thread.id!]: !isAllSelected }));
    });
  }, [threads, isAllSelected]);

  // could make this row specific in the future
  const [showReply, setShowReply] = useState(false);
  const onShowReply = useCallback(() => setShowReply(true), []);

  const [isPlanning, setIsPlanning] = useState<Record<string, boolean>>({});
  const [isCategorizing, setIsCategorizing] = useState<Record<string, boolean>>(
    {},
  );
  const [isArchiving, setIsArchiving] = useState<Record<string, boolean>>({});

  const onPlanAiAction = useCallback(
    (thread: Thread) => {
      toast.promise(
        async () => {
          setIsPlanning((s) => ({ ...s, [thread.id!]: true }));

          const message = thread.messages?.[thread.messages.length - 1];

          if (!message) return;

          const res = await postRequest<ActResponse, ActBodyWithHtml>(
            "/api/ai/act",
            {
              email: {
                from: message.parsedMessage.headers.from,
                to: message.parsedMessage.headers.to,
                date: message.parsedMessage.headers.date,
                replyTo: message.parsedMessage.headers.replyTo,
                cc: message.parsedMessage.headers.cc,
                subject: message.parsedMessage.headers.subject,
                textPlain: message.parsedMessage.textPlain || null,
                textHtml: message.parsedMessage.textHtml || null,
                snippet: thread.snippet,
                threadId: message.threadId || "",
                messageId: message.id || "",
                headerMessageId: message.parsedMessage.headers.messageId || "",
                references: message.parsedMessage.headers.references,
              },
              allowExecute: false,
            },
          );

          if (isError(res)) {
            console.error(res);
            setIsPlanning((s) => ({ ...s, [thread.id!]: false }));
            throw new Error(`There was an error planning the email.`);
          } else {
            // setPlan(res);
            refetch();
          }
          setIsPlanning((s) => ({ ...s, [thread.id!]: false }));
          return res?.rule;
        },
        {
          loading: "Planning...",
          success: (rule) => `Planned as ${rule?.name || "No Plan"}`,
          error: "There was an error planning the email :(",
        },
      );
    },
    [refetch],
  );

  const onAiCategorize = useCallback(
    (thread: Thread) => {
      toast.promise(
        async () => {
          setIsCategorizing((s) => ({ ...s, [thread.id!]: true }));

          // categorizing by first message for threads
          const message = thread.messages?.[0];

          if (!message) return;

          const res = await postRequest<
            CategoriseResponse,
            CategoriseBodyWithHtml
          >("/api/ai/categorise", {
            from: message.parsedMessage.headers.from,
            subject: message.parsedMessage.headers.subject,
            textPlain: message.parsedMessage.textPlain || null,
            textHtml: message.parsedMessage.textHtml || null,
            snippet: thread.snippet,
            threadId: message.threadId || "",
            date: message.parsedMessage.headers.date || "",
          });

          if (isError(res)) {
            console.error(res);
            setIsCategorizing((s) => ({ ...s, [thread.id!]: false }));
            throw new Error(`There was an error categorizing the email.`);
          } else {
            // setCategory(res);
            refetch();
          }
          setIsCategorizing((s) => ({ ...s, [thread.id!]: false }));

          return res?.category;
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

  const archive = useCallback(
    async (thread: Thread) => {
      setIsArchiving((s) => ({ ...s, [thread.id!]: true }));

      const res = await postRequest<ArchiveResponse, ArchiveBody>(
        "/api/google/threads/archive",
        {
          id: thread.id!,
        },
      );

      if (isError(res)) {
        console.error(res);
        setIsArchiving((s) => ({ ...s, [thread.id!]: false }));
        throw new Error(`There was an error archiving the email.`);
      } else {
        refetch();
      }
      setIsArchiving((s) => ({ ...s, [thread.id!]: false }));
    },
    [refetch],
  );

  const onArchive = useCallback(
    (thread: Thread) => {
      toast.promise(() => archive(thread), {
        loading: "Archiving...",
        success: "Archived!",
        error: "There was an error archiving the email :(",
      });
    },
    [archive],
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

  const onPlanAiBulk = useCallback(async () => {
    for (const [threadId, selected] of Object.entries(selectedRows)) {
      if (!selected) continue;
      const thread = threads.find((t) => t.id === threadId);
      if (thread) onPlanAiAction(thread);
    }
  }, [onPlanAiAction, threads, selectedRows]);

  const onCategorizeAiBulk = useCallback(async () => {
    for (const [threadId, selected] of Object.entries(selectedRows)) {
      if (!selected) continue;
      const thread = threads.find((t) => t.id === threadId);
      if (thread) onAiCategorize(thread);
    }
  }, [onAiCategorize, threads, selectedRows]);

  const onArchiveAiBulk = useCallback(async () => {
    toast.promise(
      async () => {
        for (const [threadId, selected] of Object.entries(selectedRows)) {
          if (!selected) continue;
          const thread = threads.find((t) => t.id === threadId);
          if (thread) await archive(thread);
        }
      },
      {
        loading: "Archiving emails...",
        success: "Emails archived!",
        error: "There was an error archiving the emails :(",
      },
    );
  }, [archive, threads, selectedRows]);

  const isEmpty = threads.length === 0;

  return (
    <>
      {!(isEmpty && hideActionBarWhenEmpty) && (
        <div className="flex items-center divide-gray-100 border-b border-l-4 bg-white px-4 py-2">
          <div className="pl-1">
            <Checkbox checked={isAllSelected} onChange={onToggleSelectAll} />
          </div>
          <div className="ml-4">
            <ActionButtonsBulk
              isPlanning={false}
              isCategorizing={false}
              isArchiving={false}
              onAiCategorize={onCategorizeAiBulk}
              onPlanAiAction={onPlanAiBulk}
              onArchive={onArchiveAiBulk}
            />
          </div>
        </div>
      )}
      <div
        className={clsx("h-full overflow-hidden", {
          "grid grid-cols-2": openedRowId && !isEmpty,
          "overflow-y-auto": !openedRowId,
        })}
      >
        <ul
          role="list"
          className="divide-y divide-gray-100 overflow-y-auto scroll-smooth"
          ref={listRef}
        >
          {threads.map((thread) => (
            <EmailListItem
              ref={(node) => {
                const map = getMap();
                if (node) {
                  map.set(thread.id!, node);
                } else {
                  map.delete(thread.id!);
                }
              }}
              key={thread.id}
              userEmailAddress={session.data?.user.email || ""}
              thread={thread}
              opened={openedRowId === thread.id}
              closePanel={closePanel}
              selected={selectedRows[thread.id!]}
              onSelected={onSetSelectedRow}
              splitView={!!openedRowId}
              onClick={() => {
                const alreadyOpen = !!openedRowId;
                setOpenedRowId(thread.id!);

                if (!alreadyOpen) scrollToId(thread.id!);
              }}
              onShowReply={onShowReply}
              isPlanning={isPlanning[thread.id!]}
              isCategorizing={isCategorizing[thread.id!]}
              isArchiving={isArchiving[thread.id!]}
              onPlanAiAction={onPlanAiAction}
              onAiCategorize={onAiCategorize}
              onArchive={onArchive}
              executePlan={executePlan}
              rejectPlan={rejectPlan}
              executingPlan={executingPlan[thread.id!]}
              rejectingPlan={rejectingPlan[thread.id!]}
              refetch={refetch}
            />
          ))}
        </ul>

        {isEmpty && (
          <div className="py-2">
            {typeof emptyMessage === "string" ? (
              <MessageText>{emptyMessage}</MessageText>
            ) : (
              emptyMessage
            )}
          </div>
        )}

        {!!(openedRowId && openedRow) && (
          <EmailPanel
            row={openedRow}
            showReply={showReply}
            onShowReply={onShowReply}
            isPlanning={isPlanning[openedRowId]}
            isCategorizing={isCategorizing[openedRowId]}
            isArchiving={isArchiving[openedRowId]}
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
        )}
      </div>
    </>
  );
}
