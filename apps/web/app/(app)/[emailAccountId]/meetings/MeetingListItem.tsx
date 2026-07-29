"use client";

import type { ReactNode } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import type { MeetingRecordingStatus } from "@/generated/prisma/enums";
import { getRecordingStatusBadge } from "@/app/(app)/[emailAccountId]/meetings/recording-status";

export function MeetingListItem({
  title,
  startTime,
  status,
  failureReason,
  children,
}: {
  title: string;
  startTime: string | Date;
  status: MeetingRecordingStatus | undefined;
  failureReason: string | null | undefined;
  children: ReactNode;
}) {
  const badge = getRecordingStatusBadge(status);

  return (
    <Item variant="outline">
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription>
          {format(new Date(startTime), "EEE, MMM d 'at' h:mm a")}
          {failureReason ? ` • ${failureReason}` : ""}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="gap-3">
        {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
        {children}
      </ItemActions>
    </Item>
  );
}
