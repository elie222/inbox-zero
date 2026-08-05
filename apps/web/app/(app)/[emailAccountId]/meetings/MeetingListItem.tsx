"use client";

import type { ReactNode } from "react";
import { format } from "date-fns";
import { ChevronRightIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import type { MeetingRecordingStatus } from "@/generated/prisma/enums";
import { cn } from "@/utils";
import { getRecordingStatusBadge } from "@/app/(app)/[emailAccountId]/meetings/recording-status";

export function MeetingListItem({
  title,
  startTime,
  endTime,
  status,
  failureReason,
  onClick,
  children,
}: {
  title: string;
  startTime: string | Date;
  endTime: string | Date;
  status: MeetingRecordingStatus | undefined;
  failureReason: string | null | undefined;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const badge = getRecordingStatusBadge({ status, startTime, endTime });
  const start = new Date(startTime);

  return (
    <Item
      className={cn(
        onClick &&
          "relative has-[:focus-visible]:bg-accent/50 hover:bg-accent/50",
      )}
    >
      <div className="w-20 shrink-0">
        <div className="text-sm font-medium">{format(start, "h:mm a")}</div>
        <div className="text-xs text-muted-foreground">
          {format(start, "EEE, MMM d")}
        </div>
      </div>

      <ItemContent className="min-w-0">
        <ItemTitle className="w-full min-w-0">
          {onClick ? (
            // Stretched hit area: keeps one real button for keyboard and
            // screen readers while the whole row stays clickable.
            <button
              type="button"
              onClick={onClick}
              className="min-w-0 truncate text-left outline-none after:absolute after:inset-0"
            >
              {title}
            </button>
          ) : (
            <span className="truncate">{title}</span>
          )}
        </ItemTitle>
        {failureReason && <ItemDescription>{failureReason}</ItemDescription>}
      </ItemContent>

      <ItemActions className="gap-3">
        {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
        {children}
        {onClick && (
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
      </ItemActions>
    </Item>
  );
}
