import {
  type ForwardedRef,
  type MouseEventHandler,
  forwardRef,
  useCallback,
  useMemo,
} from "react";
import Link from "next/link";
import clsx from "clsx";
import { ActionButtons } from "@/components/ActionButtons";
import { PlanBadge } from "@/components/PlanBadge";
import type { Thread } from "@/components/email-list/types";
import { extractNameFromEmail, participant } from "@/utils/email";
import { CategoryBadge } from "@/components/CategoryBadge";
import { Checkbox } from "@/components/Checkbox";
import { EmailDate } from "@/components/email-list/EmailDate";
import { decodeSnippet } from "@/utils/gmail/decode";
import { useIsInAiQueue } from "@/store/ai-queue";
import { Button } from "@/components/ui/button";
import { findCtaLink } from "@/utils/parse/parseHtml.client";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { internalDateToDate } from "@/utils/date";

export const EmailListItem = forwardRef(
  (
    props: {
      userEmail: string;
      provider: string;
      thread: Thread;
      opened: boolean;
      selected: boolean;
      splitView: boolean;
      onClick: MouseEventHandler<HTMLLIElement>;
      closePanel: () => void;
      onSelected: (id: string) => void;
      onPlanAiAction: (thread: Thread) => void;
      onArchive: (thread: Thread) => void;
      refetch: () => void;
    },
    ref: ForwardedRef<HTMLLIElement>,
  ) => {
    const { provider, thread, splitView, onSelected } = props;

    const lastMessage = thread.messages?.[thread.messages.length - 1];

    const isUnread = useMemo(() => {
      return lastMessage?.labelIds?.includes("UNREAD");
    }, [lastMessage?.labelIds]);

    const preventPropagation = useCallback(
      (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation(),
      [],
    );

    const onRowSelected = useCallback(
      () => onSelected(props.thread.id!),
      [onSelected, props.thread.id],
    );

    const isPlanning = useIsInAiQueue(props.thread.id);

    if (!lastMessage) return null;

    const decodedSnippet = decodeSnippet(thread.snippet || lastMessage.snippet);

    const cta = findCtaLink(lastMessage.textHtml);

    return (
      <ErrorBoundary extra={{ props, cta, decodedSnippet }}>
        <li
          ref={ref}
          className={clsx("group relative cursor-pointer border-l-4 py-3", {
            "hover:bg-slate-50 dark:hover:bg-slate-950":
              !props.selected && !props.opened,
            "bg-blue-50 dark:bg-blue-950": props.selected,
            "bg-blue-100 dark:bg-blue-900": props.opened,
            "bg-slate-100 dark:bg-background":
              !isUnread && !props.selected && !props.opened,
          })}
          onClick={props.onClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              props.onClick(e as any);
            }
          }}
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
                  onKeyDown={preventPropagation}
                >
                  <Checkbox
                    checked={!!props.selected}
                    onChange={onRowSelected}
                  />
                </div>

                <div className="ml-4 w-48 min-w-0 overflow-hidden truncate text-foreground">
                  {extractNameFromEmail(
                    participant(lastMessage, props.userEmail),
                  )}{" "}
                  {thread.messages.length > 1 ? (
                    <span className="font-normal">
                      ({thread.messages.length})
                    </span>
                  ) : null}
                </div>
                {!splitView && (
                  <>
                    {cta && (
                      <Button
                        variant="outline"
                        size="xs"
                        className="ml-2"
                        asChild
                      >
                        <Link href={cta.ctaLink} target="_blank">
                          {cta.ctaText}
                        </Link>
                      </Button>
                    )}
                    <div className="ml-2 min-w-0 overflow-hidden text-foreground">
                      {lastMessage.headers.subject}
                    </div>
                    <div className="ml-4 mr-6 flex flex-1 items-center overflow-hidden truncate font-normal leading-5 text-muted-foreground">
                      {decodedSnippet}
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
                    onKeyDown={preventPropagation}
                  >
                    <ActionButtons
                      threadId={thread.id!}
                      shadow
                      isPlanning={isPlanning}
                      onPlanAiAction={() => props.onPlanAiAction(thread)}
                      onArchive={() => {
                        props.onArchive(thread);
                        props.closePanel();
                      }}
                      refetch={props.refetch}
                    />
                  </div>
                  <EmailDate
                    date={internalDateToDate(lastMessage?.internalDate)}
                  />
                </div>

                {!!(thread.category?.category || thread.plan) && (
                  <div className="ml-3 flex items-center space-x-2 whitespace-nowrap">
                    {thread.category?.category ? (
                      <CategoryBadge category={thread.category.category} />
                    ) : null}
                    <PlanBadge plan={thread.plan} provider={provider} />
                  </div>
                )}
              </div>
            </div>

            {splitView && (
              <div className="mt-1.5 whitespace-nowrap text-sm leading-6">
                <div className="min-w-0 overflow-hidden font-medium text-foreground">
                  {lastMessage.headers.subject}
                </div>
                <div className="mr-6 mt-0.5 flex flex-1 items-center overflow-hidden truncate pl-1 font-normal leading-5 text-muted-foreground">
                  {decodedSnippet}
                </div>
                {cta && (
                  <Button variant="outline" size="xs" className="mt-2" asChild>
                    <Link href={cta.ctaLink} target="_blank">
                      {cta.ctaText}
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </div>
        </li>
      </ErrorBoundary>
    );
  },
);

EmailListItem.displayName = "EmailListItem";
