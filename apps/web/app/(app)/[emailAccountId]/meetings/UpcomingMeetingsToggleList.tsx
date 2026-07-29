"use client";

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError } from "@/components/Toast";
import { Toggle } from "@/components/Toggle";
import { TypographyH3 } from "@/components/Typography";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ItemGroup } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import type { GetMeetingRecorderUpcomingResponse } from "@/app/api/user/meeting-recorder/upcoming/route";
import { MeetingListItem } from "@/app/(app)/[emailAccountId]/meetings/MeetingListItem";
import { useMeetingRecorderUpcoming } from "@/hooks/useMeetingRecorder";
import { setMeetingJoinOverrideAction } from "@/utils/actions/meeting-recorder";
import { getActionErrorMessage } from "@/utils/error";

type UpcomingEvent = GetMeetingRecorderUpcomingResponse["events"][number];

export function UpcomingMeetingsToggleList({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const { data, isLoading, error, mutate } =
    useMeetingRecorderUpcoming(emailAccountId);
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
        {data?.hasAccess === false && (
          <Alert className="mt-4">
            <AlertTitle>Meeting recording requires the Plus plan</AlertTitle>
            <AlertDescription>
              Upgrade to have meetings recorded and summarized automatically.
            </AlertDescription>
          </Alert>
        )}

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
            {data.events.map((event) => (
              <MeetingListItem
                key={event.id}
                title={event.title}
                startTime={event.startTime}
                status={event.recordingStatus}
                failureReason={event.failureReason}
              >
                <Toggle
                  name={`join-${event.id}`}
                  ariaLabel={`Record ${event.title}`}
                  enabled={event.willRecord}
                  // A downgraded user must still be able to cancel a meeting
                  // that is already set to record; only enabling is gated.
                  disabled={
                    pendingEventId === event.id ||
                    (!data.hasAccess && !event.willRecord)
                  }
                  onChange={(join) => toggleEvent(event, join)}
                />
              </MeetingListItem>
            ))}
          </ItemGroup>
        )}
      </LoadingContent>
    </div>
  );
}
