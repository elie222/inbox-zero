import {
  type ForwardedRef,
  type MouseEventHandler,
  forwardRef,
  useCallback,
  useMemo,
} from "react";
import clsx from "clsx";
import { ActionButtons } from "@/components/ActionButtons";
import { formatShortDate } from "@/utils/date";
import { PlanBadge } from "@/components/PlanBadge";
import { type Thread } from "@/components/email-list/types";
import { PlanActions } from "@/components/email-list/PlanActions";
import { extractNameFromEmail, participant } from "@/utils/email";
import { CategoryBadge } from "@/components/CategoryBadge";
import { Checkbox } from "@/components/Checkbox";

export const EmailListItem = forwardRef(
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

      refetch: () => void;
    },
    ref: ForwardedRef<HTMLLIElement>,
  ) => {
    const { thread, splitView, onSelected } = props;

    const lastMessage = thread.messages?.[thread.messages.length - 1];

    const isUnread = useMemo(() => {
      return lastMessage?.labelIds?.includes("UNREAD");
    }, [lastMessage?.labelIds]);

    const preventPropagation: MouseEventHandler<HTMLSpanElement> = useCallback(
      (e) => e.stopPropagation(),
      [],
    );

    const onRowSelected = useCallback(
      () => onSelected(props.thread.id!),
      [onSelected, props.thread.id],
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
        <div className="px-4">
          <div className="mx-auto flex">
            {/* left */}
            <div
              className={clsx(
                "flex flex-1 items-center overflow-hidden whitespace-nowrap text-sm leading-6",
                {
                  "font-semibold": isUnread,
                },
              )}
            >
              <div
                className="flex items-center pl-1"
                onClick={preventPropagation}
              >
                <Checkbox checked={props.selected} onChange={onRowSelected} />
              </div>

              <div className="ml-4 w-40 min-w-0 overflow-hidden truncate text-gray-900">
                {extractNameFromEmail(
                  participant(
                    lastMessage.parsedMessage,
                    props.userEmailAddress,
                  ),
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
            <div className="flex items-center justify-between">
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
                    refetch={props.refetch}
                  />
                </div>
                <div className="flex-shrink-0 text-sm font-medium leading-5 text-gray-500">
                  {formatShortDate(
                    new Date(+(lastMessage?.internalDate || "")),
                  )}
                </div>
              </div>

              <div className="ml-3 flex items-center whitespace-nowrap">
                <CategoryBadge category={thread.category?.category} />
                <div className="ml-3">
                  <PlanBadge plan={thread.plan} />
                </div>

                <PlanActions
                  thread={thread}
                  executePlan={props.executePlan}
                  rejectPlan={props.rejectPlan}
                  executingPlan={props.executingPlan}
                  rejectingPlan={props.rejectingPlan}
                  className={thread.plan?.rule ? "ml-3" : undefined}
                />
              </div>
            </div>
          </div>

          {splitView && (
            <div className="mt-1.5 whitespace-nowrap text-sm leading-6">
              <div className="min-w-0 overflow-hidden font-medium text-gray-700">
                {lastMessage.parsedMessage.headers.subject}
              </div>
              <div className="mr-6 mt-0.5 flex flex-1 items-center overflow-hidden truncate pl-1 font-normal leading-5 text-gray-500">
                {thread.snippet}
              </div>
            </div>
          )}
        </div>
      </li>
    );
  },
);

EmailListItem.displayName = "EmailListItem";
