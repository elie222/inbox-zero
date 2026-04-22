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
          className="my-2 flex w-full items-center justify-between gap-3 overflow-hidden rounded-lg border bg-card px-3 py-2 text-left shadow-sm transition-colors hover:bg-muted/30"
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
        <div className="my-2 overflow-hidden rounded-lg border bg-card shadow-sm">
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
        className={`group flex items-center border-b border-border/40 px-3 py-2 text-sm last:border-b-0 ${threadId ? "cursor-pointer" : ""} ${isDone ? "bg-muted/30 line-through opacity-50" : "hover:bg-muted/50"}`}
        onClick={() => threadId && setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (threadId && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        {threadId && (
          <div className="mr-1 flex w-4 shrink-0 justify-center text-muted-foreground">
            {expanded ? (
              <ChevronDownIcon className="size-3.5" />
            ) : (
              <ChevronRightIcon className="size-3.5" />
            )}
          </div>
        )}

        {meta ? (
          <>
            <div className="flex w-4 shrink-0 justify-center">
              {isUnread ? (
                <div className="size-2 rounded-full bg-blue-500" />
              ) : null}
            </div>

            <span
              className={`w-40 shrink-0 truncate pr-3 text-xs ${isUnread ? "font-semibold" : ""}`}
            >
              {meta.from}
            </span>

            <span className="min-w-0 flex-1 truncate">
              <span className={isUnread ? "font-medium" : ""}>
                {meta.subject}
              </span>
              {children ? (
                <span className="ml-2 text-muted-foreground/60">
                  {" "}
                  — {children}
                </span>
              ) : null}
            </span>

            <span className="shrink-0 px-2 text-xs text-muted-foreground">
              {formatShortDate(new Date(meta.date), { lowercase: true })}
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate">{children}</span>
        )}

        <div
          className="flex shrink-0 items-center gap-1"
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
              <span className="flex items-center gap-1 px-2 text-xs text-muted-foreground">
                <CheckIcon className="size-3" />
                Archived
              </span>
            ) : (
              <Button
                variant="outline"
                size="xs"
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

export function InlineEmailDetail({
  id,
  threadid,
  children,
}: {
  id?: string;
  threadid?: string;
  children?: ReactNode;
}) {
  const emailLookup = useEmailLookup();
  const { provider, userEmail } = useAccount();
  const threadId = resolveInlineEmailThreadId({ id, threadid });
  const meta = threadId ? emailLookup.get(threadId) : undefined;
  const externalUrl = threadId
    ? getEmailUrlForMessage(
        meta?.messageId ?? threadId,
        threadId,
        userEmail,
        provider,
      )
    : null;

  return (
    <div className="my-2 overflow-hidden rounded-lg border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {meta?.subject || "Email"}
          </div>
          {meta ? (
            <div className="text-xs text-muted-foreground">
              {meta.from}
              {" · "}
              {formatShortDate(new Date(meta.date), { lowercase: true })}
            </div>
          ) : null}
          {children ? (
            <div className="mt-1 text-xs text-muted-foreground">{children}</div>
          ) : null}
        </div>
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
      </div>
      {threadId ? (
        <EmailPreview threadId={threadId} compact />
      ) : (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          No email content found.
        </div>
      )}
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

function EmailPreview({
  threadId,
  compact = false,
}: {
  threadId: string;
  compact?: boolean;
}) {
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
  const hasMultipleMessages = data.thread.messages.length > 1;

  const body = (
    <>
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
    </>
  );

  if (compact) {
    return (
      <div className="max-h-[32rem] overflow-auto">
        {hasMultipleMessages ? (
          <div className="border-b px-4 py-2 text-xs text-muted-foreground">
            Showing the latest message in this thread.
          </div>
        ) : null}
        <div className="px-4 py-3">{body}</div>
      </div>
    );
  }

  return (
    <div className="max-h-[32rem] overflow-auto border-t bg-muted/20 p-4">
      <article className="rounded-lg bg-background p-4 shadow-sm">
        <div className="mb-4">
          <div className="text-sm font-semibold text-foreground">
            {lastMessage.headers?.subject || lastMessage.subject}
          </div>
          {hasMultipleMessages ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Showing the latest message in this thread.
            </div>
          ) : null}
        </div>

        <EmailDetails message={lastMessage} />

        {body}
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
  if (!id) return;
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
