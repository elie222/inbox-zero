"use client";

import { useState, useEffect } from "react";
import { TagIcon, Undo2Icon } from "lucide-react";
import { Badge } from "@/components/Badge";
import { cn } from "@/utils";
import type { CleanThread } from "@/utils/redis/clean.types";
import { formatShortDate } from "@/utils/date";
import { LoadingMiniSpinner } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import { undoCleanInboxAction } from "@/utils/actions/clean";
import { isActionError } from "@/utils/error";
import { toastError } from "@/components/Toast";

export function EmailItem({ email }: { email: CleanThread }) {
  const [isNew, setIsNew] = useState(true);
  const [undone, setUndone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsNew(false);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  const pending = isPending(email);
  const keep = email.archive === false;

  return (
    <div
      className={cn(
        "flex items-center rounded-md border p-2 text-sm transition-all duration-300",
        isNew ? "bg-primary/5" : "bg-card",
        pending && "border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20",
        // email.status === "completed" &&
        //   "border-green-500/30 bg-green-50/50 dark:bg-green-950/20",
        email.archive && "border-green-500/30",
        email.label && "border-yellow-500/30",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center">
          <div
            className={cn(
              "mr-2 size-2 rounded-full",
              email.archive && "bg-green-500",
              keep && "bg-blue-500",
              !!email.label && "bg-yellow-500",
            )}
          />
          <div className="truncate font-medium">{email.subject}</div>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          From: {email.from} • {formatShortDate(email.date)}
        </div>
      </div>

      <div className="ml-2 flex items-center space-x-2">
        {pending && (
          <span className="mr-2 inline-flex items-center">
            <LoadingMiniSpinner />
          </span>
        )}

        {email.archive && !undone ? (
          <div className="group">
            <span className="group-hover:hidden">
              <Badge color="green">Archived</Badge>
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
        ) : keep ? (
          <Badge color="blue">Keep</Badge>
        ) : null}
        {!!email.label && (
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
