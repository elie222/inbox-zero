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

    return (
      <ErrorBoundary extra={{ props, cta, decodedSnippet }}>
        <li
          ref={ref}
          data-index={props.dataIndex}
          style={props.style}
          className={clsx(
            "group relative cursor-pointer overflow-hidden border-b border-l-4 border-b-border",
            {
              "hover:bg-slate-50 dark:hover:bg-slate-950":
                !props.selected && !props.opened,
              "bg-primary/10": props.selected,
              "bg-primary/20": props.opened,
              "bg-slate-100 dark:bg-background":
                !isUnread && !props.selected && !props.opened,
            },
          )}
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
            <div className="px-4 py-3">
              <div className="mx-auto flex min-w-0 w-full">
                {/* left */}
                <div
                  className={clsx(
                    "flex min-w-0 flex-1 items-center overflow-hidden whitespace-nowrap text-sm leading-6",
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
                      label={`Select email: ${lastMessage.headers.subject || "No subject"}`}
                      checked={!!props.selected}
                      onChange={onRowSelected}
                    />
                  </div>

                  <div className="ml-4 min-w-0 flex-1 overflow-hidden truncate text-foreground md:w-48 md:flex-none">
                    <SenderName
                      header={participant(lastMessage, props.userEmail)}
                    />{" "}
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
                          className="ml-2 hidden md:inline-flex"
                          asChild
                        >
                          <Link href={cta.ctaLink} target="_blank">
                            {cta.ctaText}
                          </Link>
                        </Button>
                      )}
                      <div className="ml-2 hidden min-w-0 overflow-hidden truncate text-foreground md:block">
                        {lastMessage.headers.subject}
                      </div>
                      <div className="ml-4 mr-6 hidden min-w-0 flex-1 overflow-hidden truncate font-normal leading-5 text-muted-foreground md:block">
                        {decodedSnippet}
                      </div>
                    </>
                  )}
                </div>

                {/* right */}
                <div className="flex shrink-0 items-center justify-between">
                  <div className="relative flex items-center">
                    <div
                      className="absolute right-0 z-20 hidden md:group-hover:block"
                      // prevent email panel being opened when clicking on action buttons
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
                    <EmailDate
                      date={internalDateToDate(lastMessage?.internalDate)}
                    />
                  </div>

                  {/* The AI's read on this email: orange when it left a
                      reason (hover to read it), gray otherwise — click to
                      reprocess either way */}
                  <Tooltip
                    content={
                      thread.plan?.reason ?? "Process this email with AI"
                    }
                  >
                    <button
                      type="button"
                      aria-label="Process with AI"
                      className={clsx(
                        "ml-3 shrink-0",
                        thread.plan?.reason
                          ? "text-primary"
                          : "text-muted-foreground/50 hover:text-muted-foreground",
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

                  {!!thread.plan && (
                    <div className="ml-3 flex min-w-0 max-w-[40vw] items-center md:max-w-56">
                      <PlanBadge plan={thread.plan} provider={provider} />
                    </div>
                  )}
                </div>
              </div>

              {/* Stacked subject/snippet: always in split view, and on mobile where the inline layout doesn't fit */}
              <div
                className={clsx(
                  "mt-1.5 min-w-0 overflow-hidden text-sm leading-6",
                  !splitView && "md:hidden",
                )}
              >
                <div className="min-w-0 overflow-hidden truncate font-medium text-foreground">
                  {lastMessage.headers.subject}
                </div>
                <div className="mr-6 mt-0.5 min-w-0 overflow-hidden truncate pl-1 font-normal leading-5 text-muted-foreground">
                  {decodedSnippet}
                </div>
                {cta && (
                  <Button variant="outline" size="xs" className="mt-2" asChild>
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
                      onPlanAiAction={() => props.onReprocess(thread)}
                      onArchive={() => {
                        props.onArchive(thread);
                        props.closePanel();
                      }}
                      refetch={props.refetch}
                    />
                  </div>
                )}
              </div>
            </div>
          </SwipeableRow>
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
