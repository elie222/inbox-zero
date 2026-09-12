"use client";

import { CheckCheckIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns/formatDistanceToNow";
import { Tooltip } from "@/components/Tooltip";
import { describeSentMessageOpen } from "@/utils/email/sent-message-open";
import { cn } from "@/utils";

export type SentMessageOpenState = {
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
};

export function SentMessageOpenStatus({
  compact = false,
  open,
}: {
  compact?: boolean;
  open: SentMessageOpenState;
}) {
  const status = describeSentMessageOpen(open, (date) =>
    formatDistanceToNow(date, { addSuffix: true }),
  );
  const opened = Boolean(open.firstOpenedAt);

  if (compact && !opened) return null;

  return (
    <Tooltip content={status.detail}>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 text-xs",
          opened
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-muted-foreground",
        )}
      >
        <CheckCheckIcon aria-hidden className="size-3.5" />
        {compact ? (
          <span className="sr-only">{status.detail}</span>
        ) : (
          status.label
        )}
      </span>
    </Tooltip>
  );
}
