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
import { ActionButtons } from "@/components/ActionButtons";
import { Celebration } from "@/components/Celebration";
import { toastError, toastInfo, toastSuccess } from "@/components/Toast";
import { postRequest } from "@/utils/api";
import { formatShortDate } from "@/utils/date";
import { isError } from "@/utils/error";
import { useSession } from "next-auth/react";
import { ActResponse } from "@/app/api/ai/act/controller";
import { ActBody } from "@/app/api/ai/act/validation";
import { PlanBadge } from "@/components/PlanBadge";
import { EmailPanel } from "@/components/email-list/EmailPanel";
import { type Thread } from "@/components/email-list/types";
import {
  PlanActions,
  useExecutePlan,
} from "@/components/email-list/PlanActions";
import { fromName, participant } from "@/components/email-list/helpers";
import { Tabs } from "@/components/Tabs";
import { GroupHeading } from "@/components/GroupHeading";
import { Card } from "@/components/Card";
import Link from "next/link";

export function List(props: { emails: Thread[]; refetch: () => void }) {
  const params = useSearchParams();
  const selectedTab = params.get("tab") || "all";
  const tabs = useMemo(
    () => [
      {
        label: "All",
        value: "all",
        href: "/mail?tab=all",
      },
      {
        label: "Planned",
        value: "planned",
        href: "/mail?tab=planned",
      },
    ],
    []
  );

  const filteredEmails = useMemo(() => {
    if (selectedTab === "planned")
      return props.emails.filter((email) => email.plan?.rule);

    return props.emails;
  }, [props.emails, selectedTab]);

  return (
    <>
      <div className="border-b border-gray-200">
        <GroupHeading
          leftContent={
            <div className="overflow-x-auto py-2 md:max-w-lg lg:max-w-xl xl:max-w-3xl 2xl:max-w-4xl">
              <Tabs selected={selectedTab} tabs={tabs} breakpoint="xs" />
            </div>
          }
          buttons={[]}
          // buttons={
          //   label
          //     ? [
          //         {
          //           label: "Label All",
          //           onClick: async () => {
          //             try {
          //               await labelThreadsAction({
          //                 labelId: label?.id!,
          //                 threadIds: tabThreads.map((thread) => thread.id!),
          //                 archive: false,
          //               });
          //               toastSuccess({
          //                 description: `Labeled emails "${label.name}".`,
          //               });
          //             } catch (error) {
          //               toastError({
          //                 description: `There was an error labeling emails "${label.name}".`,
          //               });
          //             }
          //           },
          //         },
          //         {
          //           label: "Label + Archive All",
          //           onClick: async () => {
          //             try {
          //               await labelThreadsAction({
          //                 labelId: label?.id!,
          //                 threadIds: tabThreads.map((email) => email.id!),
          //                 archive: true,
          //               });
          //               toastSuccess({
          //                 description: `Labeled and archived emails "${label.name}".`,
          //               });
          //             } catch (error) {
          //               toastError({
          //                 description: `There was an error labeling and archiving emails "${label.name}".`,
          //               });
          //             }
          //           },
          //         },
          //       ]
          //     : [
          //         {
          //           label: "Replan All",
          //           onClick: async () => {
          //             setReplanningAiSuggestions(true);
          //             try {
          //               for (const email of tabThreads) {
          //                 if (!email.plan) continue;

          //                 const emailMessage = email.messages?.[0];
          //                 const subject =
          //                   emailMessage?.parsedMessage.headers.subject || "";
          //                 const message =
          //                   emailMessage?.parsedMessage.textPlain ||
          //                   emailMessage?.parsedMessage.textHtml ||
          //                   "";

          //                 const senderEmail =
          //                   emailMessage?.parsedMessage.headers.from || "";

          //                 try {
          //                   // had trouble with server actions here
          //                   const res = await postRequest<
          //                     PlanResponse,
          //                     PlanBody
          //                   >("/api/ai/plan", {
          //                     id: email.id!,
          //                     subject,
          //                     message,
          //                     senderEmail,
          //                     replan: true,
          //                   });

          //                   if (isErrorMessage(res)) {
          //                     console.error(res);
          //                     toastError({
          //                       description: `Error planning  ${subject}`,
          //                     });
          //                   }
          //                 } catch (error) {
          //                   console.error(error);
          //                   toastError({
          //                     description: `Error archiving ${subject}`,
          //                   });
          //                 }
          //               }
          //             } catch (error) {
          //               toastError({
          //                 description: `There was an error applying the AI suggestions.`,
          //               });
          //             }
          //             setReplanningAiSuggestions(false);
          //           },
          //           loading: replanningAiSuggestions,
          //         },
          //         {
          //           label: "Apply AI Suggestions",
          //           onClick: async () => {
          //             setApplyingAiSuggestions(true);
          //             try {
          //               for (const email of tabThreads) {
          //                 if (!email.plan) continue;

          //                 const subject =
          //                   email.messages?.[0]?.parsedMessage.headers
          //                     .subject || "";

          //                 // if (email.plan.action === "archive") {
          //                 //   try {
          //                 //     // had trouble with server actions here
          //                 //     const res = await postRequest<
          //                 //       ArchiveResponse,
          //                 //       ArchiveBody
          //                 //     >("/api/google/threads/archive", {
          //                 //       id: email.id!,
          //                 //     });

          //                 //     if (isErrorMessage(res)) {
          //                 //       console.error(res);
          //                 //       toastError({
          //                 //         description: `Error archiving  ${subject}`,
          //                 //       });
          //                 //     } else {
          //                 //       toastSuccess({
          //                 //         title: "Archvied!",
          //                 //         description: `Archived ${subject}`,
          //                 //       });
          //                 //     }
          //                 //   } catch (error) {
          //                 //     console.error(error);
          //                 //     toastError({
          //                 //       description: `Error archiving ${subject}`,
          //                 //     });
          //                 //   }
          //                 // } else if (email.plan.action === "label") {
          //                 //   const labelName = email.plan.label;
          //                 //   const label = labelsArray.find(
          //                 //     (label) => label.name === labelName
          //                 //   );
          //                 //   if (!label) continue;

          //                 //   await labelThreadsAction({
          //                 //     labelId: label.id,
          //                 //     threadIds: [email.id!],
          //                 //     // threadIds: tabEmails
          //                 //     //   .map((email) => email.id)
          //                 //     //   .filter(isDefined),
          //                 //     archive: true,
          //                 //   });

          //                 //   toastSuccess({
          //                 //     title: "Labelled",
          //                 //     description: `Labelled ${subject}`,
          //                 //   });
          //                 // }
          //               }
          //             } catch (error) {
          //               toastError({
          //                 description: `There was an error applying the AI suggestions.`,
          //               });
          //             }
          //             setApplyingAiSuggestions(false);
          //           },
          //           loading: applyingAiSuggestions,
          //         },
          //       ]
          // }
        />
      </div>
      {/* <div className="divide-gray-100 border-b bg-white px-4 sm:px-6 py-2 border-l-4">
        <Checkbox checked onChange={() => {}} />
      </div> */}
      {props.emails.length ? (
        <EmailList
          threads={filteredEmails}
          emptyMessage={
            <Card className="m-4">
              No planned emails. Set rules in your{" "}
              <Link href="/settings" className="font-semibold hover:underline">
                Settings
              </Link>{" "}
              for the AI to handle incoming emails for you.
            </Card>
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
  refetch: () => void;
}) {
  const { refetch } = props;

  const [openedRowId, setOpenedRowId] = useState<string>();
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});

  // could make this row specific in the future
  const [showReply, setShowReply] = useState(false);

  const closePanel = useCallback(() => setOpenedRowId(undefined), []);
  const onShowReply = useCallback(() => setShowReply(true), []);

  const openedRow = useMemo(
    () => props.threads.find((thread) => thread.id === openedRowId),
    [openedRowId, props.threads]
  );

  const session = useSession();

  const onSetSelectedRow = useCallback(
    (id: string) => {
      setSelectedRows((s) => ({ ...s, [id]: !s[id] }));
    },
    [setSelectedRows]
  );

  const [isPlanning, setIsPlanning] = useState<Record<string, boolean>>({});

  const onPlanAiAction = useCallback(
    async (thread: Thread) => {
      setIsPlanning((s) => ({ ...s, [thread.id!]: true }));

      const message = thread.messages?.[thread.messages.length - 1];

      if (!message) return;

      // html emails contain a lot of content and goes over the token limit
      // TODO convert html emails to plain text before processing: https://www.npmjs.com/package/html-to-text
      if (!message.parsedMessage.textPlain) {
        toastError({
          description: `This email does not have a plain text version and cannot currently be planned.`,
        });
        setIsPlanning((s) => ({ ...s, [thread.id!]: false }));
        return;
      }

      toastInfo({ description: `Planning the email...` });

      const res = await postRequest<ActResponse, ActBody>("/api/ai/act", {
        email: {
          from: message.parsedMessage.headers.from,
          to: message.parsedMessage.headers.to,
          date: message.parsedMessage.headers.date,
          replyTo: message.parsedMessage.headers.replyTo,
          cc: message.parsedMessage.headers.cc,
          subject: message.parsedMessage.headers.subject,
          textPlain: message.parsedMessage.textPlain,
          textHtml: message.parsedMessage.textHtml,
          threadId: message.threadId || "",
          messageId: message.id || "",
          headerMessageId: message.parsedMessage.headers.messageId || "",
          references: message.parsedMessage.headers.references,
        },
        allowExecute: false,
      });

      if (isError(res)) {
        console.error(res);
        toastError({ description: `There was an error planning the email.` });
      } else {
        // setPlan(res);
        toastSuccess({ description: `Planned the email.` });
        refetch();
      }
      setIsPlanning((s) => ({ ...s, [thread.id!]: false }));
    },
    [refetch]
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
    useExecutePlan();

  return (
    <div
      className={clsx("h-full overflow-hidden", {
        "grid grid-cols-2": openedRowId,
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
            onPlanAiAction={onPlanAiAction}
            refetchEmails={props.refetch}
            executePlan={executePlan}
            rejectPlan={rejectPlan}
            executingPlan={executingPlan[thread.id!]}
            rejectingPlan={rejectingPlan[thread.id!]}
          />
        ))}
      </ul>

      {props.threads.length === 0 && props.emptyMessage}

      {!!(openedRowId && openedRow) && (
        <EmailPanel
          row={openedRow}
          showReply={showReply}
          onShowReply={onShowReply}
          isPlanning={isPlanning[openedRowId]}
          onPlanAiAction={onPlanAiAction}
          close={closePanel}
          executePlan={executePlan}
          rejectPlan={rejectPlan}
          executingPlan={executingPlan[openedRowId]}
          rejectingPlan={rejectingPlan[openedRowId]}
        />
      )}
    </div>
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
      onSelected: (id: string) => void;
      onShowReply: () => void;
      isPlanning: boolean;
      onPlanAiAction: (thread: Thread) => Promise<void>;
      refetchEmails: () => void;

      executingPlan: boolean;
      rejectingPlan: boolean;
      executePlan: (thread: Thread) => Promise<void>;
      rejectPlan: (thread: Thread) => Promise<void>;
    },
    ref: ForwardedRef<HTMLLIElement>
  ) => {
    const { thread, splitView, onSelected } = props;

    const lastMessage = thread.messages?.[thread.messages.length - 1];

    const preventPropagation: MouseEventHandler<HTMLSpanElement> = useCallback(
      (e) => e.stopPropagation(),
      []
    );

    return (
      <li
        ref={ref}
        className={clsx("group relative cursor-pointer border-l-4 py-3 ", {
          "hover:bg-gray-50": !props.selected && !props.opened,
          "bg-blue-50": props.selected,
          "bg-blue-100": props.opened,
        })}
        onClick={props.onClick}
      >
        <div className="px-4 sm:px-6">
          <div className="mx-auto flex">
            {/* left */}
            <div className="flex flex-1 overflow-hidden whitespace-nowrap text-sm leading-6">
              {/* <div className="flex items-center">
              <Checkbox checked={props.selected} onChange={onRowSelected} />
            </div> */}

              {/* <div className="ml-4 w-40 min-w-0 overflow-hidden truncate font-semibold text-gray-900"> */}
              <div className="w-40 min-w-0 overflow-hidden truncate font-semibold text-gray-900">
                {fromName(
                  participant(lastMessage.parsedMessage, props.userEmailAddress)
                )}
              </div>
              {!splitView && (
                <>
                  <div className="ml-4 min-w-0 overflow-hidden font-medium text-gray-700">
                    {lastMessage.parsedMessage.headers.subject}
                  </div>
                  <div className="ml-4 mr-6 flex flex-1 items-center overflow-hidden truncate font-normal leading-5 text-gray-500">
                    {thread.snippet || lastMessage.snippet}
                  </div>
                </>
              )}
            </div>

            {/* right */}
            <div className="flex w-[260px] items-center justify-between">
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
                    onPlanAiAction={() => props.onPlanAiAction(thread)}
                  />
                </div>
                <div className="flex-shrink-0 text-sm font-medium leading-5 text-gray-500">
                  {formatShortDate(
                    new Date(+(lastMessage?.internalDate || ""))
                  )}
                </div>
              </div>

              <div className="ml-3 flex items-center whitespace-nowrap">
                <PlanBadge plan={thread.plan} />

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
