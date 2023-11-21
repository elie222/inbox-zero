import {
  type ForwardedRef,
  type MouseEventHandler,
  forwardRef,
  useCallback,
  useRef,
  useState,
  useMemo,
} from "react";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import countBy from "lodash/countBy";
import { capitalCase } from "capital-case";
import Link from "next/link";
import { toast } from "sonner";
import { ActionButtons } from "@/components/ActionButtons";
import { ActionButtonsBulk } from "@/components/ActionButtonsBulk";
import { Celebration } from "@/components/Celebration";
import { postRequest } from "@/utils/api";
import { formatShortDate } from "@/utils/date";
import { isError } from "@/utils/error";
import { useSession } from "next-auth/react";
import { ActResponse } from "@/app/api/ai/act/controller";
import { ActBodyWithHtml } from "@/app/api/ai/act/validation";
import { PlanBadge } from "@/components/PlanBadge";
import { EmailPanel } from "@/components/email-list/EmailPanel";
import { type Thread } from "@/components/email-list/types";
import {
  PlanActions,
  useExecutePlan,
} from "@/components/email-list/PlanActions";
import { fromName, participant } from "@/utils/email";
import { Tabs } from "@/components/Tabs";
import { GroupHeading } from "@/components/GroupHeading";
import { CategoryBadge } from "@/components/CategoryBadge";
import { CategoriseResponse } from "@/app/api/ai/categorise/controller";
import { CategoriseBodyWithHtml } from "@/app/api/ai/categorise/validation";
import { Checkbox } from "@/components/Checkbox";
import {
  ArchiveBody,
  ArchiveResponse,
} from "@/app/api/google/threads/archive/controller";
import { MessageText } from "@/components/Typography";
import { AlertBasic } from "@/components/Alert";

export function List(props: { emails: Thread[]; refetch: () => void }) {
  const params = useSearchParams();
  const selectedTab = params.get("tab") || "all";

  const categories = useMemo(() => {
    return countBy(
      props.emails,
      (email) => email.category?.category || "Uncategorized"
    );
  }, [props.emails]);

  const planned = useMemo(() => {
    return props.emails.filter((email) => email.plan?.rule);
  }, [props.emails]);

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
    [categories, planned]
  );

  const filteredEmails = useMemo(() => {
    if (selectedTab === "planned") return planned;

    if (selectedTab === "all") return props.emails;

    if (selectedTab === "Uncategorized")
      return props.emails.filter((email) => !email.category?.category);

    return props.emails.filter(
      (email) => email.category?.category === selectedTab
    );
  }, [props.emails, selectedTab, planned]);

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
      {props.emails.length ? (
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
          refetch={props.refetch}
        />
      ) : (
        <Celebration />
      )}
    </>
  );
}

export function EmailList(props: {
  threads: Thread[];
  emptyMessage?: React.ReactNode;
  hideActionBarWhenEmpty?: boolean;
  refetch: () => void;
}) {
  const { refetch } = props;

  const session = useSession();

  // if right panel is open
  const [openedRowId, setOpenedRowId] = useState<string>();
  const closePanel = useCallback(() => setOpenedRowId(undefined), []);

  const openedRow = useMemo(
    () => props.threads.find((thread) => thread.id === openedRowId),
    [openedRowId, props.threads]
  );

  // if checkbox for a row has been checked
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});

  const onSetSelectedRow = useCallback(
    (id: string) => {
      setSelectedRows((s) => ({ ...s, [id]: !s[id] }));
    },
    [setSelectedRows]
  );

  const isAllSelected = useMemo(() => {
    return props.threads.every((thread) => selectedRows[thread.id!]);
  }, [props.threads, selectedRows]);

  const onToggleSelectAll = useCallback(() => {
    props.threads.forEach((thread) => {
      setSelectedRows((s) => ({ ...s, [thread.id!]: !isAllSelected }));
    });
  }, [props.threads, isAllSelected]);

  // could make this row specific in the future
  const [showReply, setShowReply] = useState(false);
  const onShowReply = useCallback(() => setShowReply(true), []);

  const [isPlanning, setIsPlanning] = useState<Record<string, boolean>>({});
  const [isCategorizing, setIsCategorizing] = useState<Record<string, boolean>>(
    {}
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
            }
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
        }
      );
    },
    [refetch]
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
        }
      );
    },
    [refetch]
  );

  const archive = useCallback(
    async (thread: Thread) => {
      setIsArchiving((s) => ({ ...s, [thread.id!]: true }));

      const res = await postRequest<ArchiveResponse, ArchiveBody>(
        "/api/google/threads/archive",
        {
          id: thread.id!,
        }
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
    [refetch]
  );

  const onArchive = useCallback(
    (thread: Thread) => {
      toast.promise(() => archive(thread), {
        loading: "Archiving...",
        success: "Archived!",
        error: "There was an error archiving the email :(",
      });
    },
    [archive]
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
    useExecutePlan(props.refetch);

  const onPlanAiBulk = useCallback(async () => {
    for (const [threadId, selected] of Object.entries(selectedRows)) {
      if (!selected) continue;
      const thread = props.threads.find((t) => t.id === threadId);
      if (thread) onPlanAiAction(thread);
    }
  }, [onPlanAiAction, props.threads, selectedRows]);

  const onCategorizeAiBulk = useCallback(async () => {
    for (const [threadId, selected] of Object.entries(selectedRows)) {
      if (!selected) continue;
      const thread = props.threads.find((t) => t.id === threadId);
      if (thread) onAiCategorize(thread);
    }
  }, [onAiCategorize, props.threads, selectedRows]);

  const onArchiveAiBulk = useCallback(async () => {
    toast.promise(
      async () => {
        for (const [threadId, selected] of Object.entries(selectedRows)) {
          if (!selected) continue;
          const thread = props.threads.find((t) => t.id === threadId);
          if (thread) await archive(thread);
        }
      },
      {
        loading: "Archiving emails...",
        success: "Emails archived!",
        error: "There was an error archiving the emails :(",
      }
    );
  }, [archive, props.threads, selectedRows]);

  const isEmpty = props.threads.length === 0;

  return (
    <>
      {!(isEmpty && props.hideActionBarWhenEmpty) && (
        <div className="flex items-center divide-gray-100 border-b border-l-4 bg-white px-4 py-2 sm:px-6">
          <Checkbox checked={isAllSelected} onChange={onToggleSelectAll} />
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
          {props.threads.map((thread) => (
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
            />
          ))}
        </ul>

        {isEmpty && (
          <div className="py-2">
            {typeof props.emptyMessage === "string" ? (
              <MessageText>{props.emptyMessage}</MessageText>
            ) : (
              props.emptyMessage
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
          />
        )}
      </div>
    </>
  );
}

const EmailListItem = forwardRef(
  (
    props: {
      userEmailAddress: string;
      thread: Thread;
      opened: boolean;
      selected: boolean;
      splitView: boolean;
      onClick: MouseEventHandler<HTMLLIElement>;
      closePanel: () => void;
      onSelected: (id: string) => void;
      onShowReply: () => void;
      isPlanning: boolean;
      isCategorizing: boolean;
      isArchiving: boolean;
      onPlanAiAction: (thread: Thread) => void;
      onAiCategorize: (thread: Thread) => void;
      onArchive: (thread: Thread) => void;

      executingPlan: boolean;
      rejectingPlan: boolean;
      executePlan: (thread: Thread) => Promise<void>;
      rejectPlan: (thread: Thread) => Promise<void>;
    },
    ref: ForwardedRef<HTMLLIElement>
  ) => {
    const { thread, splitView, onSelected } = props;

    const lastMessage = thread.messages?.[thread.messages.length - 1];

    const isUnread = useMemo(() => {
      return lastMessage?.labelIds?.includes("UNREAD");
    }, [lastMessage?.labelIds]);

    const preventPropagation: MouseEventHandler<HTMLSpanElement> = useCallback(
      (e) => e.stopPropagation(),
      []
    );

    const onRowSelected = useCallback(
      () => onSelected(props.thread.id!),
      [onSelected, props.thread.id]
    );

    return (
      <li
        ref={ref}
        className={clsx("group relative cursor-pointer border-l-4 py-3 ", {
          "hover:bg-gray-50": !props.selected && !props.opened,
          "bg-blue-50": props.selected,
          "bg-blue-100": props.opened,
          "bg-gray-100": !isUnread && !props.selected && !props.opened,
        })}
        onClick={props.onClick}
      >
        <div className="px-4 sm:px-6">
          <div className="mx-auto flex">
            {/* left */}
            <div
              className={clsx(
                "flex flex-1 items-center overflow-hidden whitespace-nowrap text-sm leading-6",
                {
                  "font-semibold": isUnread,
                }
              )}
            >
              <div className="flex items-center" onClick={preventPropagation}>
                <Checkbox checked={props.selected} onChange={onRowSelected} />
              </div>

              <div className="ml-4 w-40 min-w-0 overflow-hidden truncate text-gray-900">
                {fromName(
                  participant(lastMessage.parsedMessage, props.userEmailAddress)
                )}

                {thread.messages.length > 1 ? (
                  <span className="font-normal">
                    ({thread.messages.length})
                  </span>
                ) : null}
              </div>
              {!splitView && (
                <>
                  <div className="ml-4 min-w-0 overflow-hidden text-gray-700">
                    {lastMessage.parsedMessage.headers.subject}
                  </div>
                  <div className="ml-4 mr-6 flex flex-1 items-center overflow-hidden truncate font-normal leading-5 text-gray-500">
                    {thread.snippet || lastMessage.snippet}
                  </div>
                </>
              )}
            </div>

            {/* right */}
            <div className="flex w-[350px] items-center justify-between">
              <div className="relative flex items-center">
                <div
                  className="absolute right-0 z-20 hidden group-hover:block"
                  // prevent email panel being opened when clicking on action buttons
                  onClick={preventPropagation}
                >
                  <ActionButtons
                    threadId={thread.id!}
                    onReply={props.onShowReply}
                    isPlanning={props.isPlanning}
                    isCategorizing={props.isCategorizing}
                    isArchiving={props.isArchiving}
                    onPlanAiAction={() => props.onPlanAiAction(thread)}
                    onAiCategorize={() => props.onAiCategorize(thread)}
                    onArchive={() => {
                      props.onArchive(thread);
                      props.closePanel();
                    }}
                  />
                </div>
                <div className="flex-shrink-0 text-sm font-medium leading-5 text-gray-500">
                  {formatShortDate(
                    new Date(+(lastMessage?.internalDate || ""))
                  )}
                </div>
              </div>

              <div className="ml-3 flex items-center whitespace-nowrap">
                <CategoryBadge category={thread.category?.category} />
                <div className="ml-3">
                  <PlanBadge plan={thread.plan} />
                </div>

                <div className="ml-3">
                  <PlanActions
                    thread={thread}
                    executePlan={props.executePlan}
                    rejectPlan={props.rejectPlan}
                    executingPlan={props.executingPlan}
                    rejectingPlan={props.rejectingPlan}
                  />
                </div>
              </div>
            </div>
          </div>

          {splitView && (
            <div className="mt-1.5 whitespace-nowrap text-sm leading-6">
              <div className="min-w-0 overflow-hidden font-medium text-gray-700">
                {lastMessage.parsedMessage.headers.subject}
              </div>
              <div className="mr-6 mt-0.5 flex flex-1 items-center overflow-hidden truncate font-normal leading-5 text-gray-500">
                {thread.snippet}
              </div>
            </div>
          )}
        </div>
      </li>
    );
  }
);

EmailListItem.displayName = "EmailListItem";
