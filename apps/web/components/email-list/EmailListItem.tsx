import {
  type ForwardedRef,
  type MouseEventHandler,
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import clsx from "clsx";
import { motion, type PanInfo } from "framer-motion";
import { ArchiveIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { Tooltip } from "@/components/Tooltip";
import { ActionButtons } from "@/components/ActionButtons";
import { LoadingMiniSpinner } from "@/components/Loading";
import { useIsMobile } from "@/hooks/use-mobile";
import { PlanBadge } from "@/components/PlanBadge";
import type { Thread } from "@/components/email-list/types";
import { useContactPeek } from "@/components/email-list/contact-peek-context";
import {
  extractEmailAddress,
  extractNameFromEmail,
  participant,
} from "@/utils/email";
import { Checkbox } from "@/components/Checkbox";
import { EmailDate } from "@/components/email-list/EmailDate";
import { decodeSnippet } from "@/utils/gmail/decode";
import { useIsInAiQueue } from "@/store/ai-queue";
import { Button } from "@/components/ui/button";
import { findCtaLink } from "@/utils/parse/parseHtml.client";
import { getDisplayedMessage } from "@/utils/email/displayed-message";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { internalDateToDate } from "@/utils/date";
import { SenderAvatar } from "@/components/email-list/SenderAvatar";

export const EmailListItem = forwardRef(
  (
    props: {
      userEmail: string;
      provider: string;
      folderType?: string;
      thread: Thread;
      opened: boolean;
      selected: boolean;
      splitView: boolean;
      onClick: MouseEventHandler<HTMLLIElement>;
      closePanel: () => void;
      onSelected: (id: string) => void;
      // Sparkles icon / mobile AI button: reprocess with the ask-before-move dialog
      onReprocess: (thread: Thread) => void;
      onArchive: (thread: Thread) => void;
      onDelete: (thread: Thread) => void;
      // Right-click: the row's context menu (filter/rule/chat)
      onRowContextMenu?: (event: React.MouseEvent, thread: Thread) => void;
      refetch: () => void;
      // virtualization: index for dynamic row measurement + positioning styles
      dataIndex?: number;
      style?: React.CSSProperties;
    },
    ref: ForwardedRef<HTMLLIElement>,
  ) => {
    const { provider, thread, splitView, onSelected } = props;

    const isMobile = useIsMobile();

    const lastMessage = getDisplayedMessage(thread, props.folderType);

    const isUnread = useMemo(
      () => lastMessage?.labelIds?.includes("UNREAD"),
      [lastMessage?.labelIds],
    );

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

    const senderHeader = participant(lastMessage, props.userEmail);
    const senderName = extractNameFromEmail(senderHeader) || senderHeader;

    return (
      <ErrorBoundary extra={{ props, cta, decodedSnippet }}>
        {/* The li is the virtualizer's measured, absolutely-positioned slot —
            the card and its gap live inside so measurement stays correct */}
        <li
          ref={ref}
          data-index={props.dataIndex}
          style={props.style}
          className="px-4 pb-2 sm:px-6"
          onClick={props.onClick}
          onContextMenu={(e) => {
            if (!props.onRowContextMenu) return;
            e.preventDefault();
            props.onRowContextMenu(e, thread);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
              props.onClick(e as any);
            }
          }}
        >
          <div
            className={clsx(
              "group relative cursor-pointer overflow-hidden rounded-[10px] border",
              props.opened
                ? "border-primary/60 bg-card"
                : props.selected
                  ? "border-primary/50 bg-primary/5"
                  : isUnread
                    ? "border-border bg-card hover:bg-muted/40"
                    : "border-border/60 bg-card/50 hover:bg-muted/40",
            )}
          >
            <SwipeableRow
              enabled={isMobile}
              onSwipeRight={() => {
                props.onArchive(thread);
                props.closePanel();
              }}
              onSwipeLeft={() => {
                props.onDelete(thread);
                props.closePanel();
              }}
            >
              <div className="flex min-w-0 items-center gap-3 px-3.5 py-2.5">
                <div
                  className="flex shrink-0 items-center"
                  onClick={preventPropagation}
                  onKeyDown={preventPropagation}
                >
                  <Checkbox
                    label={`Select email: ${lastMessage.headers.subject || "No subject"}`}
                    checked={!!props.selected}
                    onChange={onRowSelected}
                  />
                </div>

                <SenderAvatar name={senderName} />

                <div className="min-w-0 flex-1">
                  {/* Inline on wide screens, stacked on mobile and in split
                      view where the columns don't fit */}
                  <div
                    className={clsx(
                      "flex min-w-0 gap-x-2 text-sm",
                      splitView
                        ? "flex-col"
                        : "flex-col md:flex-row md:items-center",
                    )}
                  >
                    <span
                      className={clsx(
                        "shrink-0 truncate",
                        splitView ? "max-w-full" : "md:max-w-[180px]",
                        isUnread ? "font-bold" : "font-medium",
                      )}
                    >
                      <SenderName header={senderHeader} />
                      {thread.messages.length > 1 && (
                        <span className="ml-1 font-normal text-muted-foreground">
                          ({thread.messages.length})
                        </span>
                      )}
                    </span>
                    <span
                      className={clsx(
                        "min-w-0 truncate text-[13.5px]",
                        isUnread
                          ? "font-semibold text-foreground"
                          : "text-foreground/80",
                      )}
                    >
                      {lastMessage.headers.subject}
                    </span>
                    <span
                      className={clsx(
                        "min-w-0 flex-1 truncate text-[13px] text-muted-foreground",
                        splitView && "hidden",
                      )}
                    >
                      {decodedSnippet}
                    </span>
                  </div>
                  {cta && (
                    <Button
                      variant="outline"
                      size="xs"
                      className="mt-1.5"
                      asChild
                    >
                      <Link href={cta.ctaLink} target="_blank">
                        {cta.ctaText}
                      </Link>
                    </Button>
                  )}
                  {/* Touch devices have no hover: show the row actions inline */}
                  {!splitView && (
                    <div
                      className="mt-2 md:hidden"
                      onClick={preventPropagation}
                      onKeyDown={preventPropagation}
                    >
                      <ActionButtons
                        threadId={thread.id!}
                        isPlanning={isPlanning}
                        onArchive={() => {
                          props.onArchive(thread);
                          props.closePanel();
                        }}
                        refetch={props.refetch}
                      />
                    </div>
                  )}
                </div>

                {!!thread.plan && !splitView && (
                  <div className="hidden min-w-0 max-w-56 shrink-0 items-center md:flex">
                    <PlanBadge plan={thread.plan} provider={provider} />
                  </div>
                )}

                {/* The AI's read on this email: orange when it left a reason
                    (hover to read it), gray otherwise — click to reprocess */}
                <Tooltip
                  content={thread.plan?.reason ?? "Process this email with AI"}
                >
                  <button
                    type="button"
                    aria-label="Process with AI"
                    className={clsx(
                      "shrink-0",
                      thread.plan?.reason
                        ? "text-primary"
                        : "text-muted-foreground/40 hover:text-muted-foreground",
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      props.onReprocess(thread);
                    }}
                    onKeyDown={preventPropagation}
                  >
                    {isPlanning ? (
                      <LoadingMiniSpinner />
                    ) : (
                      <SparklesIcon className="size-3.5" />
                    )}
                  </button>
                </Tooltip>

                <div className="relative flex shrink-0 items-center">
                  <div
                    className="absolute right-0 z-20 hidden md:group-hover:block"
                    // prevent the thread opening when clicking a row action
                    onClick={preventPropagation}
                    onKeyDown={preventPropagation}
                  >
                    <ActionButtons
                      threadId={thread.id!}
                      shadow
                      isPlanning={isPlanning}
                      onArchive={() => {
                        props.onArchive(thread);
                        props.closePanel();
                      }}
                      refetch={props.refetch}
                    />
                  </div>
                  <span className="w-16 text-right text-[12.5px] text-muted-foreground">
                    <EmailDate
                      date={internalDateToDate(lastMessage?.internalDate)}
                    />
                  </span>
                </div>
              </div>
            </SwipeableRow>
          </div>
        </li>
      </ErrorBoundary>
    );
  },
);

EmailListItem.displayName = "EmailListItem";

// A sender name that opens the contact sheet when the page provides one
// (the mail page); plain text elsewhere. Row clicks must not fire too.
export function SenderName({ header }: { header: string }) {
  const openContactPeek = useContactPeek();
  const name = extractNameFromEmail(header);

  if (!openContactPeek) return <>{name}</>;

  return (
    <button
      type="button"
      className="max-w-full truncate align-bottom hover:underline"
      onClick={(e) => {
        e.stopPropagation();
        openContactPeek(extractEmailAddress(header) || header);
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {name}
    </button>
  );
}

// Touch rows swipe horizontally: right reveals archive, left reveals trash.
// The transform lives on this inner wrapper — the parent li's transform is
// owned by the list virtualizer.
function SwipeableRow({
  enabled,
  onSwipeRight,
  onSwipeLeft,
  children,
}: {
  enabled: boolean;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  children: React.ReactNode;
}) {
  const [dragX, setDragX] = useState(0);

  if (!enabled) return <>{children}</>;

  return (
    <>
      {dragX !== 0 && (
        <div
          className={clsx(
            "absolute inset-0 flex items-center px-6 text-white",
            dragX > 0 ? "justify-start bg-green-600" : "justify-end bg-red-600",
          )}
          aria-hidden="true"
        >
          {dragX > 0 ? (
            <ArchiveIcon className="size-5" />
          ) : (
            <Trash2Icon className="size-5" />
          )}
        </div>
      )}
      <motion.div
        className={clsx("relative", dragX !== 0 && "bg-background")}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.9}
        onDrag={(_event: unknown, info: PanInfo) => setDragX(info.offset.x)}
        onDragEnd={(_event: unknown, info: PanInfo) => {
          setDragX(0);
          const threshold = Math.min(160, window.innerWidth * 0.35);
          const flung =
            Math.abs(info.velocity.x) > 600 && Math.abs(info.offset.x) > 60;
          if (info.offset.x > threshold || (flung && info.velocity.x > 0)) {
            onSwipeRight();
          } else if (
            info.offset.x < -threshold ||
            (flung && info.velocity.x < 0)
          ) {
            onSwipeLeft();
          }
        }}
      >
        {children}
      </motion.div>
    </>
  );
}
