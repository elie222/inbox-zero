"use client";

import Link from "next/link";
import { Trans } from "@lingui/react/macro";
import {
  ExternalLinkIcon,
  Undo2Icon,
  ArchiveIcon,
  CheckIcon,
} from "lucide-react";
import { Badge } from "@/components/Badge";
import { cn } from "@/utils";
import type { CleanThread } from "@/utils/redis/clean.types";
import { formatShortDate } from "@/utils/date";
import { Button } from "@/components/ui/button";
import {
  undoCleanInboxAction,
  changeKeepToDoneAction,
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
  undoState,
  setUndoing,
  setUndone,
}: {
  email: CleanThread;
  userEmail: string;
  emailAccountId: string;
  action: CleanAction;
  undoState?: "undoing" | "undone";
  setUndoing: (threadId: string) => void;
  setUndone: (threadId: string) => void;
}) {
  const status = getStatus(email);
  const pending = isPending(email);
  const archive = email.archive === true;
  const label = !!email.label;

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
          <Trans>
            From: {email.from} • {formatShortDate(email.date)}
          </Trans>
        </div>
      </div>

      <div className="ml-2 flex items-center space-x-2">
        <StatusBadge
          status={status}
          email={email}
          action={action}
          undoState={undoState}
          setUndoing={setUndoing}
          setUndone={setUndone}
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
  undoState,
  setUndoing,
  setUndone,
  emailAccountId,
}: {
  status: Status;
  email: CleanThread;
  action: CleanAction;
  undoState?: "undoing" | "undone";
  setUndoing: (threadId: string) => void;
  setUndone: (threadId: string) => void;
  emailAccountId: string;
}) {
  if (status === "processing") {
    return (
      <Badge color="purple">
        <Trans>Processing...</Trans>
      </Badge>
    );
  }

  if (undoState === "undoing") {
    return (
      <Badge color="purple">
        <Trans>Undoing...</Trans>
      </Badge>
    );
  }

  if (undoState === "undone") {
    return (
      <Badge color="purple">
        <Trans>Undone</Trans>
      </Badge>
    );
  }

  // If the email has the undone flag, show it as undone regardless of other status
  if (email.undone) {
    return (
      <Badge color="purple">
        <Trans>Undone</Trans>
      </Badge>
    );
  }

  if (status === "markedDone" || status === "markingDone") {
    return (
      <div className="group">
        <span className="group-hover:hidden">
          <Badge color="green">
            <DoneBadgeText status={status} action={action} />
          </Badge>
        </span>
        <div className="hidden group-hover:inline-flex">
          <Button
            size="xs"
            variant="ghost"
            onClick={async () => {
              if (undoState) return;

              setUndoing(email.threadId);

              const result = await undoCleanInboxAction(emailAccountId, {
                threadId: email.threadId,
                markedDone: !!email.archive,
                action,
              });

              if (result?.serverError) {
                toastError({ description: result.serverError });
              } else {
                setUndone(email.threadId);
              }
            }}
          >
            <Undo2Icon className="size-3" />
            <Trans>Undo</Trans>
          </Button>
        </div>
      </div>
    );
  }

  if (status === "keep") {
    return (
      <div className="group">
        <span className="group-hover:hidden">
          <Badge color="blue">
            <Trans>Keep</Trans>
          </Badge>
        </span>
        <div className="hidden group-hover:inline-flex">
          <Button
            size="xs"
            variant="ghost"
            onClick={async () => {
              if (undoState) return;

              setUndoing(email.threadId);

              const result = await changeKeepToDoneAction(emailAccountId, {
                threadId: email.threadId,
                action,
              });

              if (result?.serverError) {
                toastError({ description: result.serverError });
              } else {
                setUndone(email.threadId);
              }
            }}
          >
            {action === CleanAction.ARCHIVE ? (
              <>
                <ArchiveIcon className="mr-1 size-3" />
                <Trans>Archive</Trans>
              </>
            ) : (
              <>
                <CheckIcon className="mr-1 size-3" />
                <Trans>Mark Read</Trans>
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  if (status === "labelled") {
    return <Badge color="yellow">{email.label}</Badge>;
  }
}

function DoneBadgeText({
  status,
  action,
}: {
  status: Status;
  action: CleanAction;
}) {
  if (status === "markingDone") {
    return action === CleanAction.MARK_READ ? (
      <Trans>Marking read...</Trans>
    ) : (
      <Trans>Archiving...</Trans>
    );
  }
  return action === CleanAction.MARK_READ ? (
    <Trans>Marked read</Trans>
  ) : (
    <Trans>Archived</Trans>
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
