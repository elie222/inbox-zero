"use client";

import { useState, type ReactNode } from "react";
import {
  ArchiveIcon,
  ExternalLinkIcon,
  Loader2,
  ReplyIcon,
} from "lucide-react";
import { useEmailLookup } from "@/components/assistant-chat/email-lookup-context";
import { useAccount } from "@/providers/EmailAccountProvider";
import { archiveThreadAction } from "@/utils/actions/mail";
import { getEmailUrlForMessage } from "@/utils/url";
import { formatShortDate } from "@/utils/date";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";

type ActionState = "idle" | "loading" | "done";

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

  const meta = id ? emailLookup.get(id) : undefined;

  const externalUrl =
    meta && id
      ? getEmailUrlForMessage(meta.messageId, id, userEmail, provider)
      : null;

  async function handleArchive() {
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

  return (
    <div
      className={`my-1.5 flex items-start gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm transition-opacity ${isDone ? "opacity-50" : ""}`}
    >
      <div className="min-w-0 flex-1">
        {meta ? (
          <>
            <div className="flex items-baseline gap-2">
              <span
                className={`truncate ${meta.isUnread ? "font-semibold" : ""}`}
              >
                {meta.from}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatShortDate(new Date(meta.date), { lowercase: true })}
              </span>
            </div>
            <div className="truncate text-muted-foreground">{meta.subject}</div>
          </>
        ) : null}
        {children ? (
          <div
            className={`text-xs ${meta ? "mt-0.5 text-muted-foreground/70" : "text-muted-foreground"}`}
          >
            {children}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {externalUrl ? (
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={`Open in ${provider === "microsoft" ? "Outlook" : "Gmail"}`}
          >
            <ExternalLinkIcon className="size-3.5" />
          </a>
        ) : null}

        {action === "archive" && id && meta ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={actionState !== "idle"}
            onClick={handleArchive}
          >
            {actionState === "loading" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ArchiveIcon className="size-3.5" />
            )}
            {isDone ? "Archived" : "Archive"}
          </Button>
        ) : null}

        {action === "reply" ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <ReplyIcon className="size-3.5" />
            Reply
          </span>
        ) : null}
      </div>
    </div>
  );
}
