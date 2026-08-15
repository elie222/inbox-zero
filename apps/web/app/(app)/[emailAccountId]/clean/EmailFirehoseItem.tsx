"use client";

import Link from "next/link";
import {
  ExternalLinkIcon,
  Undo2Icon,
  ArchiveIcon,
  CheckIcon,
  XIcon,
} from "lucide-react";
import { Badge } from "@/components/Badge";
import { cn } from "@/utils";
import type { CleanThread } from "@/utils/redis/clean.types";
import { formatShortDate } from "@/utils/date";
import { Button } from "@/components/ui/button";
import {
  undoCleanInboxAction,
  changeKeepToDoneAction,
  removeLabelFromThreadAction,
} from "@/utils/actions/clean";
import { toastError } from "@/components/Toast";
import { getGmailUrl } from "@/utils/url";
import { CleanAction } from "@/generated/prisma/enums";

type Status = "markedDone" | "markingDone" | "keep" | "labelled" | "processing";

export function EmailItem({
  email,
  userEmail,
  emailAccountId,
  action,
  jobId,
  undoState,
  setUndoing,
  setUndone,
  resetUndoing,
  labelRemoved,
  setLabelRemoved,
}: {
  email: CleanThread;
  userEmail: string;
  emailAccountId: string;
  action: CleanAction;
  jobId: string;
  undoState?: "undoing" | "undone";
  setUndoing: (threadId: string) => void;
  setUndone: (threadId: string) => void;
  resetUndoing: (threadId: string) => void;
  labelRemoved: boolean;
  setLabelRemoved: (threadId: string) => void;
}) {
  // Locally hide the label once it's been removed, mirroring the state Redis
  // will converge to via SSE — without marking the whole thread as undone.
  const effectiveEmail =
    email.label && labelRemoved ? { ...email, label: undefined } : email;
  const status = getStatus(effectiveEmail);
  const pending = isPending(email);
  const archive = effectiveEmail.archive === true;
  const label = !!effectiveEmail.label;

  return (
    <div
      className={cn(
        "flex items-center rounded-md border p-2 text-sm transition-all duration-300",
        pending && "border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20",
        archive && "border-green-500/30",
        label && "border-yellow-500/30",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center">
          <StatusCircle status={status} />
          <div className="truncate font-medium">{email.subject}</div>
          <Link
            className="ml-2 hover:text-foreground"
            href={getGmailUrl(email.threadId, userEmail)}
            target="_blank"
          >
            <ExternalLinkIcon className="size-3" />
          </Link>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          From: {email.from} • {formatShortDate(email.date)}
        </div>
      </div>

      <div className="ml-2 flex items-center space-x-2">
        <StatusBadge
          status={status}
          email={effectiveEmail}
          action={action}
          jobId={jobId}
          undoState={undoState}
          setUndoing={setUndoing}
          setUndone={setUndone}
          resetUndoing={resetUndoing}
          setLabelRemoved={setLabelRemoved}
          emailAccountId={emailAccountId}
        />
      </div>
    </div>
  );
}

function StatusCircle({ status }: { status: Status }) {
  return (
    <div
      className={cn(
        "mr-2 size-2 rounded-full",
        (status === "markedDone" || status === "markingDone") && "bg-green-500",
        status === "keep" && "bg-blue-500",
        status === "labelled" && "bg-yellow-500",
      )}
    />
  );
}

function StatusBadge({
  status,
  email,
  action,
  jobId,
  undoState,
  setUndoing,
  setUndone,
  resetUndoing,
  setLabelRemoved,
  emailAccountId,
}: {
  status: Status;
  email: CleanThread;
  action: CleanAction;
  jobId: string;
  undoState?: "undoing" | "undone";
  setUndoing: (threadId: string) => void;
  setUndone: (threadId: string) => void;
  resetUndoing: (threadId: string) => void;
  setLabelRemoved: (threadId: string) => void;
  emailAccountId: string;
}) {
  if (status === "processing") {
    return <Badge color="purple">Processing...</Badge>;
  }

  if (undoState === "undoing") {
    return <Badge color="purple">Undoing...</Badge>;
  }

  if (undoState === "undone") {
    return <Badge color="purple">Undone</Badge>;
  }

  // If the email has the undone flag, show it as undone regardless of other status
  if (email.undone) {
    return <Badge color="purple">Undone</Badge>;
  }

  if (status === "markedDone" || status === "markingDone") {
    return (
      <>
        <HoverAction
          badge={
            <Badge color="green">
              {status === "markingDone"
                ? action === CleanAction.MARK_READ
                  ? "Marking read..."
                  : "Archiving..."
                : action === CleanAction.MARK_READ
                  ? "Marked read"
                  : "Archived"}
            </Badge>
          }
          icon={<Undo2Icon className="size-3" />}
          text="Undo"
          onClick={async () => {
            if (undoState) return;

            setUndoing(email.threadId);

            const result = await undoCleanInboxAction(emailAccountId, {
              threadId: email.threadId,
              markedDone: !!email.archive,
              action,
              jobId,
            });

            if (result?.serverError) {
              toastError({ description: result.serverError });
              resetUndoing(email.threadId);
            } else {
              setUndone(email.threadId);
            }
          }}
        />
        {email.label && (
          <HoverAction
            badge={<Badge color="yellow">{email.label}</Badge>}
            icon={<XIcon className="size-3" />}
            text="Remove label"
            onClick={async () => {
              if (undoState) return;

              setUndoing(email.threadId);

              const result = await removeLabelFromThreadAction(emailAccountId, {
                threadId: email.threadId,
                jobId,
              });

              if (result?.serverError) {
                toastError({ description: result.serverError });
              } else {
                setLabelRemoved(email.threadId);
              }
              resetUndoing(email.threadId);
            }}
          />
        )}
      </>
    );
  }

  if (status === "keep") {
    return (
      <HoverAction
        badge={<Badge color="blue">Keep</Badge>}
        icon={
          action === CleanAction.ARCHIVE ? (
            <ArchiveIcon className="size-3" />
          ) : (
            <CheckIcon className="size-3" />
          )
        }
        text={action === CleanAction.ARCHIVE ? "Archive" : "Mark Read"}
        onClick={async () => {
          if (undoState) return;

          setUndoing(email.threadId);

          const result = await changeKeepToDoneAction(emailAccountId, {
            threadId: email.threadId,
            action,
          });

          if (result?.serverError) {
            toastError({ description: result.serverError });
            resetUndoing(email.threadId);
          } else {
            setUndone(email.threadId);
          }
        }}
      />
    );
  }

  if (status === "labelled") {
    return (
      <HoverAction
        badge={<Badge color="yellow">{email.label}</Badge>}
        icon={<XIcon className="size-3" />}
        text="Remove label"
        onClick={async () => {
          if (undoState) return;

          setUndoing(email.threadId);

          const result = await removeLabelFromThreadAction(emailAccountId, {
            threadId: email.threadId,
            jobId,
          });

          if (result?.serverError) {
            toastError({ description: result.serverError });
          } else {
            setLabelRemoved(email.threadId);
          }
          resetUndoing(email.threadId);
        }}
      />
    );
  }
}

// Swaps a status badge for an action button on hover/focus. The button is
// overlaid over the badge (which keeps its footprint) so the row never
// reflows, and it stays visible on touch devices that have no hover. The
// button stays in the tab order while hidden (opacity + pointer-events, not
// visibility) so keyboard users can reach it: focusing it reveals the action.
function HoverAction({
  badge,
  icon,
  text,
  onClick,
}: {
  badge: React.ReactNode;
  icon: React.ReactNode;
  text: string;
  onClick: () => void;
}) {
  return (
    <div className="group relative">
      <span className="pointer-events-none block transition-opacity group-hover:opacity-0 group-focus-within:opacity-0 [@media(hover:none)]:opacity-0">
        {badge}
      </span>
      <div className="absolute inset-0 flex items-center justify-center whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
        <Button
          size="xs"
          variant="ghost"
          onClick={onClick}
          className="pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto [@media(hover:none)]:pointer-events-auto"
        >
          {icon}
          {text}
        </Button>
      </div>
    </div>
  );
}

function getStatus(email: CleanThread): Status {
  // If the email is marked as undone, we still want to show the original status
  // The StatusBadge component will handle showing the undone state

  if (email.archive) {
    if (email.status === "processing") return "markingDone";
    return "markedDone";
  }

  if (email.label) {
    return "labelled";
  }

  if (email.archive === false) {
    return "keep";
  }

  return "processing";
}

function isPending(email: CleanThread) {
  return email.status === "processing" || email.status === "applying";
}
