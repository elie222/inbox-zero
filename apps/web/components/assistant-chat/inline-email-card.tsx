"use client";

import { Children, isValidElement, useState, type ReactNode } from "react";
import {
  ArchiveIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  MailOpenIcon,
} from "lucide-react";
import { useEmailLookup } from "@/components/assistant-chat/email-lookup-context";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  archiveThreadAction,
  markReadThreadAction,
} from "@/utils/actions/mail";
import { getEmailUrlForMessage } from "@/utils/url";
import { formatShortDate } from "@/utils/date";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/Tooltip";
import { useThread } from "@/hooks/useThread";

type ActionState = "idle" | "loading" | "done";

export function InlineEmailList({ children }: { children?: ReactNode }) {
  const { emailAccountId } = useAccount();
  const [archiveAllState, setArchiveAllState] = useState<ActionState>("idle");
  const [markReadState, setMarkReadState] = useState<ActionState>("idle");
  const threadIds = collectThreadIds(children);

  async function handleArchiveAll() {
    if (archiveAllState !== "idle" || threadIds.length === 0) return;
    setArchiveAllState("loading");
    try {
      const results = await Promise.all(
        threadIds.map((threadId) =>
          archiveThreadAction(emailAccountId, { threadId }),
        ),
      );
      const failedCount = results.filter((r) => r?.serverError).length;
      if (failedCount === results.length) {
        toastError({ description: "Failed to archive emails" });
        setArchiveAllState("idle");
      } else if (failedCount > 0) {
        toastSuccess({
          description: `Archived ${results.length - failedCount} of ${results.length} emails`,
        });
        setArchiveAllState("idle");
      } else {
        toastSuccess({ description: `Archived ${threadIds.length} emails` });
        setArchiveAllState("done");
      }
    } catch {
      toastError({ description: "Failed to archive emails" });
      setArchiveAllState("idle");
    }
  }

  async function handleMarkAllRead() {
    if (markReadState !== "idle" || threadIds.length === 0) return;
    setMarkReadState("loading");
    try {
      const results = await Promise.all(
        threadIds.map((threadId) =>
          markReadThreadAction(emailAccountId, { threadId, read: true }),
        ),
      );
      const failedCount = results.filter((r) => r?.serverError).length;
      if (failedCount === results.length) {
        toastError({ description: "Failed to mark emails as read" });
        setMarkReadState("idle");
      } else if (failedCount > 0) {
        toastSuccess({
          description: `Marked ${results.length - failedCount} of ${results.length} as read`,
        });
        setMarkReadState("idle");
      } else {
        toastSuccess({ description: `Marked ${threadIds.length} as read` });
        setMarkReadState("done");
      }
    } catch {
      toastError({ description: "Failed to mark emails as read" });
      setMarkReadState("idle");
    }
  }

  return (
    <div className="my-2 overflow-hidden rounded-lg border bg-card shadow-sm">
      {threadIds.length > 0 && (
        <div className="flex items-center justify-end gap-1 border-b px-3 py-1.5">
          <Tooltip
            content={
              archiveAllState === "done" ? "All archived" : "Archive all"
            }
          >
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              loading={archiveAllState === "loading"}
              disabled={archiveAllState === "done"}
              onClick={handleArchiveAll}
              Icon={archiveAllState === "done" ? CheckIcon : ArchiveIcon}
            />
          </Tooltip>
          <Tooltip
            content={
              markReadState === "done" ? "All marked read" : "Mark all read"
            }
          >
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              loading={markReadState === "loading"}
              disabled={markReadState === "done"}
              onClick={handleMarkAllRead}
              Icon={markReadState === "done" ? CheckIcon : MailOpenIcon}
            />
          </Tooltip>
        </div>
      )}
      {children}
    </div>
  );
}

export function InlineEmailCard({
  id,
  action,
  children,
}: {
  id?: string;
  action?: string;
  children?: ReactNode;
}) {
  const emailLookup = useEmailLookup();
  const { emailAccountId, provider, userEmail } = useAccount();
  const [actionState, setActionState] = useState<ActionState>("idle");
  const [expanded, setExpanded] = useState(false);

  const meta = id ? emailLookup.get(id) : undefined;

  const externalUrl = id
    ? getEmailUrlForMessage(meta?.messageId ?? id, id, userEmail, provider)
    : null;

  async function handleArchive(e: React.MouseEvent) {
    e.stopPropagation();
    if (!id || actionState !== "idle") return;
    setActionState("loading");
    try {
      const result = await archiveThreadAction(emailAccountId, {
        threadId: id,
      });
      if (result?.serverError) {
        toastError({ description: result.serverError });
        setActionState("idle");
        return;
      }
      toastSuccess({ description: "Archived" });
      setActionState("done");
    } catch {
      toastError({ description: "Failed to archive" });
      setActionState("idle");
    }
  }

  const isDone = actionState === "done";
  const showArchive = id && (!action || action === "archive");

  return (
    <div>
      <div
        role={id ? "button" : undefined}
        tabIndex={id ? 0 : undefined}
        className={`group flex items-center border-b border-border/40 px-3 py-2 text-sm last:border-b-0 ${id ? "cursor-pointer" : ""} ${isDone ? "bg-muted/30 line-through opacity-50" : "hover:bg-muted/50"}`}
        onClick={() => id && setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (id && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        {id && (
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
              {meta.isUnread ? (
                <div className="size-2 rounded-full bg-blue-500" />
              ) : null}
            </div>

            <span
              className={`w-40 shrink-0 truncate pr-3 text-xs ${meta.isUnread ? "font-semibold" : ""}`}
            >
              {meta.from}
            </span>

            <span className="min-w-0 flex-1 truncate">
              <span className={meta.isUnread ? "font-medium" : ""}>
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

      {expanded && id && <EmailPreview threadId={id} />}
    </div>
  );
}

function collectThreadIds(children: ReactNode): string[] {
  const ids: string[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement<{ id?: string }>(child) && child.props.id) {
      ids.push(child.props.id);
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
  const text =
    lastMessage.textPlain || lastMessage.snippet || "No content available.";

  return (
    <div className="max-h-60 overflow-auto border-t bg-muted/20 px-6 py-3 text-xs whitespace-pre-wrap text-muted-foreground">
      {text}
    </div>
  );
}
