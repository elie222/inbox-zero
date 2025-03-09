"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLinkIcon, TagIcon, Undo2Icon } from "lucide-react";
import { Badge } from "@/components/Badge";
import { cn } from "@/utils";
import type { CleanThread } from "@/utils/redis/clean.types";
import { formatShortDate } from "@/utils/date";
import { Button } from "@/components/ui/button";
import { undoCleanInboxAction } from "@/utils/actions/clean";
import { isActionError } from "@/utils/error";
import { toastError } from "@/components/Toast";
import { getGmailUrl } from "@/utils/url";

export function EmailItem({
  email,
  userEmail,
}: {
  email: CleanThread;
  userEmail: string;
}) {
  const [undone, setUndone] = useState(false);

  const pending = isPending(email);
  const keep = email.archive === false;
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
          <div
            className={cn(
              "mr-2 size-2 rounded-full",
              archive && "bg-green-500",
              keep && "bg-blue-500",
              label && "bg-yellow-500",
            )}
          />
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
        {keep && <Badge color="blue">Keep</Badge>}
        {!keep && !undone && (
          <div className="group">
            <span className="group-hover:hidden">
              <Badge color="green">
                {pending ? "Archiving..." : "Archived"}
              </Badge>
            </span>
            <div className="hidden group-hover:inline-flex">
              <Button
                size="xs"
                variant="ghost"
                onClick={async () => {
                  const result = await undoCleanInboxAction({
                    threadId: email.threadId,
                    archived: !!email.archive,
                  });

                  if (isActionError(result)) {
                    toastError({ description: result.error });
                  } else {
                    setUndone(true);
                  }
                }}
              >
                <Undo2Icon className="size-3" />
                Undo
              </Button>
            </div>
          </div>
        )}
        {label && (
          <div className="flex items-center">
            <TagIcon className="mr-1 h-3.5 w-3.5 text-yellow-500" />
            <Badge color="yellow" className="h-5 px-1 py-0 text-xs">
              {email.label}
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}

function isPending(email: CleanThread) {
  return email.status === "processing" || email.status === "applying";
}
