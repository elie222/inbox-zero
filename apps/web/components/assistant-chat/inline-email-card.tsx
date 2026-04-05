"use client";

import React, {
  Children,
  createContext,
  useEffect,
  isValidElement,
  useState,
  useContext,
  type ReactNode,
} from "react";
import {
  ArchiveIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  MailOpenIcon,
} from "lucide-react";
import { useEmailLookup } from "@/components/assistant-chat/email-lookup-context";
import { useInlineEmailActionContext } from "@/components/assistant-chat/inline-email-action-context";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  archiveThreadAction,
  markReadThreadAction,
} from "@/utils/actions/mail";
import { normalizeInlineEmailThreadIds } from "@/utils/ai/assistant/inline-email-actions";
import { getEmailUrlForMessage } from "@/utils/url";
import { formatShortDate } from "@/utils/date";
import { cn } from "@/utils";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/Tooltip";
import { EmailAttachments } from "@/components/email-list/EmailAttachments";
import { EmailDetails } from "@/components/email-list/EmailDetails";
import { HtmlEmail, PlainEmail } from "@/components/email-list/EmailContents";
import { useThread } from "@/hooks/useThread";

type ActionState = "idle" | "loading" | "done";

type InlineEmailListState = {
  archivedThreadIds: Set<string>;
  readThreadIds: Set<string>;
  markArchived: (threadIds: string[]) => void;
  markRead: (threadIds: string[]) => void;
};

const InlineEmailListContext = createContext<InlineEmailListState | null>(null);

export function InlineEmailList({ children }: { children?: ReactNode }) {
  const { emailAccountId } = useAccount();
  const inlineEmailActionContext = useInlineEmailActionContext();
  const [archiveAllState, setArchiveAllState] = useState<ActionState>("idle");
  const [markReadState, setMarkReadState] = useState<ActionState>("idle");
  const [collapsed, setCollapsed] = useState(false);
  const [hasAutoCollapsed, setHasAutoCollapsed] = useState(false);
  const [archivedThreadIds, setArchivedThreadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [readThreadIds, setReadThreadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const threadIds = normalizeInlineEmailThreadIds(collectThreadIds(children));
  const remainingArchiveThreadIds = threadIds.filter(
    (threadId) => !archivedThreadIds.has(threadId),
  );
  const remainingReadThreadIds = threadIds.filter(
    (threadId) => !readThreadIds.has(threadId),
  );
  const archiveAllDone =
    archiveAllState === "done" || remainingArchiveThreadIds.length === 0;
  const markReadDone =
    markReadState === "done" || remainingReadThreadIds.length === 0;
  const allHandled =
    threadIds.length > 0 &&
    threadIds.every(
      (threadId) =>
        archivedThreadIds.has(threadId) || readThreadIds.has(threadId),
    );

  useEffect(() => {
    if (!allHandled) {
      setCollapsed(false);
      setHasAutoCollapsed(false);
      return;
    }

    if (hasAutoCollapsed) return;

    const timeoutId = window.setTimeout(() => {
      setCollapsed(true);
      setHasAutoCollapsed(true);
    }, 800);

    return () => window.clearTimeout(timeoutId);
  }, [allHandled, hasAutoCollapsed]);

  function markArchived(threadIds: string[]) {
    setArchivedThreadIds((current) => addThreadIds(current, threadIds));
  }

  function markRead(threadIds: string[]) {
    setReadThreadIds((current) => addThreadIds(current, threadIds));
  }

  async function handleArchiveAll() {
    if (archiveAllState !== "idle" || remainingArchiveThreadIds.length === 0) {
      return;
    }
    setArchiveAllState("loading");
    try {
      const results = await Promise.all(
        remainingArchiveThreadIds.map((threadId) =>
          archiveThreadAction(emailAccountId, { threadId }),
        ),
      );
      const successfulThreadIds = getSuccessfulThreadIds(
        remainingArchiveThreadIds,
        results,
      );
      const failedCount = results.filter((r) => r?.serverError).length;
      if (failedCount === results.length) {
        toastError({ description: "Failed to archive emails" });
        setArchiveAllState("idle");
      } else if (failedCount > 0) {
        markArchived(successfulThreadIds);
        inlineEmailActionContext?.queueAction(
          "archive_threads",
          successfulThreadIds,
        );
        toastSuccess({
          description: `Archived ${results.length - failedCount} of ${results.length} emails`,
        });
        setArchiveAllState("idle");
      } else {
        markArchived(successfulThreadIds);
        inlineEmailActionContext?.queueAction(
          "archive_threads",
          successfulThreadIds,
        );
        toastSuccess({
          description: `Archived ${remainingArchiveThreadIds.length} emails`,
        });
        setArchiveAllState("done");
      }
    } catch {
      toastError({ description: "Failed to archive emails" });
      setArchiveAllState("idle");
    }
  }

  async function handleMarkAllRead() {
    if (markReadState !== "idle" || remainingReadThreadIds.length === 0) {
      return;
    }
    setMarkReadState("loading");
    try {
      const results = await Promise.all(
        remainingReadThreadIds.map((threadId) =>
          markReadThreadAction(emailAccountId, { threadId, read: true }),
        ),
      );
      const successfulThreadIds = getSuccessfulThreadIds(
        remainingReadThreadIds,
        results,
      );
      const failedCount = results.filter((r) => r?.serverError).length;
      if (failedCount === results.length) {
        toastError({ description: "Failed to mark emails as read" });
        setMarkReadState("idle");
      } else if (failedCount > 0) {
        markRead(successfulThreadIds);
        inlineEmailActionContext?.queueAction(
          "mark_read_threads",
          successfulThreadIds,
        );
        toastSuccess({
          description: `Marked ${results.length - failedCount} of ${results.length} as read`,
        });
        setMarkReadState("idle");
      } else {
        markRead(successfulThreadIds);
        inlineEmailActionContext?.queueAction(
          "mark_read_threads",
          successfulThreadIds,
        );
        toastSuccess({
          description: `Marked ${remainingReadThreadIds.length} as read`,
        });
        setMarkReadState("done");
      }
    } catch {
      toastError({ description: "Failed to mark emails as read" });
      setMarkReadState("idle");
    }
  }

  return (
    <InlineEmailListContext.Provider
      value={{
        archivedThreadIds,
        readThreadIds,
        markArchived,
        markRead,
      }}
    >
      {collapsed ? (
        <button
          type="button"
          className="my-3 flex w-full items-center justify-between gap-3 overflow-hidden rounded-lg border bg-card px-3 py-2 text-left shadow-sm transition-colors hover:bg-muted/30 sm:my-2"
          onClick={() => setCollapsed(false)}
        >
          <div className="min-w-0">
            <div className="text-sm font-medium">Completed emails</div>
            <div className="text-xs text-muted-foreground">
              {formatCompletedSummary({
                threadIds,
                archivedThreadIds,
                readThreadIds,
              })}
            </div>
          </div>
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <div className="my-3 overflow-hidden rounded-lg border bg-card shadow-sm sm:my-2">
          {threadIds.length > 0 && (
            <div className="flex items-center justify-end gap-1 border-b px-3 py-1.5">
              <Tooltip
                content={archiveAllDone ? "All archived" : "Archive all"}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  loading={archiveAllState === "loading"}
                  disabled={archiveAllDone}
                  onClick={handleArchiveAll}
                  Icon={archiveAllDone ? CheckIcon : ArchiveIcon}
                />
              </Tooltip>
              <Tooltip
                content={markReadDone ? "All marked read" : "Mark all read"}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  loading={markReadState === "loading"}
                  disabled={markReadDone}
                  onClick={handleMarkAllRead}
                  Icon={markReadDone ? CheckIcon : MailOpenIcon}
                />
              </Tooltip>
            </div>
          )}
          {children}
        </div>
      )}
    </InlineEmailListContext.Provider>
  );
}

export function InlineEmailCard({
  id,
  threadid,
  children,
}: {
  id?: string;
  threadid?: string;
  action?: string;
  children?: ReactNode;
}) {
  const emailLookup = useEmailLookup();
  const listState = useContext(InlineEmailListContext);
  const inlineEmailActionContext = useInlineEmailActionContext();
  const { emailAccountId, provider, userEmail } = useAccount();
  const [actionState, setActionState] = useState<ActionState>("idle");
  const [expanded, setExpanded] = useState(false);
  const threadId = resolveInlineEmailThreadId({ id, threadid });

  const meta = threadId ? emailLookup.get(threadId) : undefined;
  const isArchived = !!threadId && !!listState?.archivedThreadIds.has(threadId);
  const isMarkedRead = !!threadId && !!listState?.readThreadIds.has(threadId);
  const isUnread = !!meta?.isUnread && !isMarkedRead && !isArchived;
  const formattedDate = meta?.date
    ? formatShortDate(new Date(meta.date), { lowercase: true })
    : null;

  const externalUrl = threadId
    ? getEmailUrlForMessage(
        meta?.messageId ?? threadId,
        threadId,
        userEmail,
        provider,
      )
    : null;

  async function handleArchive(e: React.MouseEvent) {
    e.stopPropagation();
    if (!threadId || actionState !== "idle") return;
    setActionState("loading");
    try {
      const result = await archiveThreadAction(emailAccountId, {
        threadId,
      });
      if (result?.serverError) {
        toastError({ description: result.serverError });
        setActionState("idle");
        return;
      }
      listState?.markArchived([threadId]);
      inlineEmailActionContext?.queueAction("archive_threads", [threadId]);
      toastSuccess({ description: "Archived" });
      setActionState("done");
    } catch {
      toastError({ description: "Failed to archive" });
      setActionState("idle");
    }
  }

  const isDone = actionState === "done" || isArchived;
  const showArchive = Boolean(threadId);

  return (
    <div>
      <div
        role={threadId ? "button" : undefined}
        tabIndex={threadId ? 0 : undefined}
        className={cn(
          "group flex items-start gap-2 border-b border-border/40 px-3 py-3 text-sm transition-colors last:border-b-0 md:items-center md:py-2",
          threadId && "cursor-pointer",
          isDone
            ? "bg-muted/30 line-through opacity-50"
            : "hover:bg-muted/50",
        )}
        onClick={() => threadId && setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (threadId && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        {threadId && (
          <div className="mt-0.5 flex w-4 shrink-0 justify-center text-muted-foreground md:mt-0">
            {expanded ? (
              <ChevronDownIcon className="size-3.5" />
            ) : (
              <ChevronRightIcon className="size-3.5" />
            )}
          </div>
        )}

        {meta ? (
          <>
            <div className="mt-1 flex w-4 shrink-0 justify-center md:mt-0">
              {isUnread ? (
                <div className="size-2 rounded-full bg-blue-500" />
              ) : null}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <span
                  className={cn(
                    "min-w-0 truncate text-xs text-muted-foreground md:w-40 md:shrink-0 md:pr-3",
                    isUnread && "font-semibold text-foreground",
                  )}
                >
                  {meta.from}
                </span>
                {formattedDate ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formattedDate}
                  </span>
                ) : null}
              </div>

              <div className="mt-1 min-w-0 md:mt-0">
                <div
                  className={cn(
                    "min-w-0 break-words leading-snug md:truncate",
                    isUnread && "font-medium",
                  )}
                >
                  {meta.subject}
                  {children ? (
                    <span className="ml-1.5 text-xs text-muted-foreground/80 md:ml-2">
                      - {children}
                    </span>
                  ) : null}
                </div>
                {meta.snippet ? (
                  <div className="mt-1 text-xs leading-relaxed text-muted-foreground md:hidden">
                    {meta.snippet}
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate">{children}</span>
        )}

        <div
          className="ml-auto flex shrink-0 items-start gap-1 self-start md:self-center"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {externalUrl ? (
            <Tooltip content="Open in email">
              <a
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ExternalLinkIcon className="size-3.5" />
              </a>
            </Tooltip>
          ) : null}

          {showArchive ? (
            isDone ? (
              <span className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                <CheckIcon className="size-3" />
                Archived
              </span>
            ) : (
              <Button
                variant="outline"
                size="xs-2"
                loading={actionState === "loading"}
                onClick={handleArchive}
                Icon={ArchiveIcon}
              >
                Archive
              </Button>
            )
          ) : null}
        </div>
      </div>

      {expanded && threadId && <EmailPreview threadId={threadId} />}
    </div>
  );
}

function collectThreadIds(children: ReactNode): string[] {
  const ids: string[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<{ id?: string; threadid?: string }>(child)) return;

    const threadId = resolveInlineEmailThreadId(child.props);
    if (threadId) {
      ids.push(threadId);
    }
  });
  return ids;
}

function EmailPreview({ threadId }: { threadId: string }) {
  const { data, isLoading, error } = useThread({ id: threadId });

  if (isLoading) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>
    );
  }

  if (error) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">
        Could not load email content: {error.message}
      </div>
    );
  }

  if (!data?.thread?.messages?.length) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">
        No email content found.
      </div>
    );
  }

  const lastMessage = data.thread.messages[data.thread.messages.length - 1];

  return (
    <div className="max-h-[32rem] overflow-auto border-t bg-muted/20 p-4">
      <article className="rounded-lg bg-background p-4 shadow-sm">
        <div className="mb-4">
          <div className="text-sm font-semibold text-foreground">
            {lastMessage.headers?.subject || lastMessage.subject}
          </div>
          {data.thread.messages.length > 1 ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Showing the latest message in this thread.
            </div>
          ) : null}
        </div>

        <EmailDetails message={lastMessage} />

        {lastMessage.textHtml ? (
          <HtmlEmail html={lastMessage.textHtml} />
        ) : (
          <PlainEmail
            text={
              lastMessage.textPlain ||
              lastMessage.snippet ||
              "No content available."
            }
          />
        )}

        {lastMessage.attachments?.length ? (
          <EmailAttachments message={lastMessage} />
        ) : null}
      </article>
    </div>
  );
}

function resolveInlineEmailThreadId({
  id,
  threadid,
}: {
  id?: string;
  threadid?: string;
}) {
  if (threadid) return threadid;
  if (!id) return undefined;
  if (id.startsWith("user-content-")) {
    return id.slice("user-content-".length) || undefined;
  }
  return id;
}

function addThreadIds(current: Set<string>, threadIds: string[]) {
  if (!threadIds.length) return current;

  const next = new Set(current);

  for (const threadId of threadIds) {
    next.add(threadId);
  }

  return next;
}

function getSuccessfulThreadIds(
  threadIds: string[],
  results: Array<{ serverError?: string } | undefined>,
) {
  return threadIds.filter((_, index) => !results[index]?.serverError);
}

function formatCompletedSummary({
  threadIds,
  archivedThreadIds,
  readThreadIds,
}: {
  threadIds: string[];
  archivedThreadIds: Set<string>;
  readThreadIds: Set<string>;
}) {
  const archivedCount = threadIds.filter((threadId) =>
    archivedThreadIds.has(threadId),
  ).length;
  const readOnlyCount = threadIds.filter(
    (threadId) =>
      !archivedThreadIds.has(threadId) && readThreadIds.has(threadId),
  ).length;

  const parts: string[] = [];

  if (archivedCount > 0) {
    parts.push(`${archivedCount} archived`);
  }

  if (readOnlyCount > 0) {
    parts.push(`${readOnlyCount} marked read`);
  }

  return parts.join(", ");
}
