"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError } from "@/components/Toast";
import { Toggle } from "@/components/Toggle";
import { TypographyH3 } from "@/components/Typography";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import type { GetMeetingRecorderUpcomingResponse } from "@/app/api/user/meeting-recorder/upcoming/route";
import { getRecordingStatusBadge } from "@/app/(app)/[emailAccountId]/meetings/recording-status";
import { useMeetingRecorderUpcoming } from "@/hooks/useMeetingRecorder";
import { setMeetingJoinOverrideAction } from "@/utils/actions/meeting-recorder";
import { getActionErrorMessage } from "@/utils/error";

type UpcomingEvent = GetMeetingRecorderUpcomingResponse["events"][number];

export function UpcomingMeetingsToggleList({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const { data, isLoading, error, mutate } = useMeetingRecorderUpcoming();
  const [pendingEventId, setPendingEventId] = useState<string | null>(null);

  const { execute } = useAction(
    setMeetingJoinOverrideAction.bind(null, emailAccountId),
    {
      onError: ({ error }) => {
        toastError({
          description: getActionErrorMessage(error, {
            prefix: "Failed to update this meeting",
          }),
        });
      },
      onSettled: () => {
        setPendingEventId(null);
        mutate();
      },
    },
  );

  const toggleEvent = (event: UpcomingEvent, join: boolean) => {
    setPendingEventId(event.id);
    execute({ join, calendarEventId: event.id });
  };

  return (
    <div>
      <TypographyH3>Upcoming</TypographyH3>

      <LoadingContent
        loading={isLoading}
        error={error}
        loadingComponent={<Skeleton className="mt-4 h-24 w-full" />}
      >
        {!data?.events.length ? (
          <Empty className="mt-4 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarIcon />
              </EmptyMedia>
              <EmptyTitle>No upcoming calls with a video link</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup className="mt-4 gap-2">
            {data.events.map((event) => {
              const badge = getRecordingStatusBadge(event.recordingStatus);

              return (
                <Item key={event.id} variant="outline">
                  <ItemContent>
                    <ItemTitle>{event.title}</ItemTitle>
                    <ItemDescription>
                      {format(
                        new Date(event.startTime),
                        "EEE, MMM d 'at' h:mm a",
                      )}
                      {event.failureReason ? ` • ${event.failureReason}` : ""}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions className="gap-3">
                    {badge && (
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    )}
                    <Toggle
                      name={`join-${event.id}`}
                      ariaLabel={`Record ${event.title}`}
                      enabled={event.willRecord}
                      disabled={pendingEventId === event.id}
                      onChange={(join) => toggleEvent(event, join)}
                    />
                  </ItemActions>
                </Item>
              );
            })}
          </ItemGroup>
        )}
      </LoadingContent>
    </div>
  );
}
