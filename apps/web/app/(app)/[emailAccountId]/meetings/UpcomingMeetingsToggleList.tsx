"use client";

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { ListCard } from "@/components/ListCard";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError } from "@/components/Toast";
import { Toggle } from "@/components/Toggle";
import { MutedText, TypographyH3 } from "@/components/Typography";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { UpgradeToPlusButton } from "@/components/UpgradeToPlusButton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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

  const events = data?.events ?? [];
  const joiningCount = events.filter(isJoining).length;
  const isLocked = data?.hasAccess === false;

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <TypographyH3>Up next</TypographyH3>
        {events.length > 0 && (
          <MutedText>
            Joining {joiningCount} of {events.length}
          </MutedText>
        )}
      </div>

      <LoadingContent
        loading={isLoading}
        error={error}
        loadingComponent={<Skeleton className="mt-4 h-24 w-full" />}
      >
        {isLocked && (
          <Alert className="mt-4">
            <AlertTitle>Meeting recording requires the Plus plan</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              Upgrade to have meetings recorded and summarized automatically.
              <UpgradeToPlusButton tooltip="Upgrade to the Plus plan to record and summarize your meetings." />
            </AlertDescription>
          </Alert>
        )}

        {!events.length ? (
          <Empty className="mt-4 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarIcon />
              </EmptyMedia>
              <EmptyTitle>No upcoming calls with a video link</EmptyTitle>
              <EmptyDescription>
                Only calendar events that carry a video link can be recorded.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ListCard className="mt-4">
            {events.map((event) => {
              const joining = isJoining(event);

              return (
                <MeetingListItem
                  key={event.id}
                  title={event.title}
                  startTime={event.startTime}
                  status={event.recordingStatus}
                  failureReason={event.failureReason}
                >
                  <MutedText className="hidden w-14 text-right sm:block">
                    {joining ? "Joining" : "Skipping"}
                  </MutedText>
                  <Toggle
                    name={`join-${event.id}`}
                    ariaLabel={`Record ${event.title}`}
                    enabled={joining}
                    // A downgraded user must still be able to cancel a booked
                    // meeting; only creating a new booking is gated.
                    disabled={
                      pendingEventId === event.id || (isLocked && !joining)
                    }
                    onChange={(join) => toggleEvent(event, join)}
                  />
                </MeetingListItem>
              );
            })}
          </ListCard>
        )}
      </LoadingContent>
    </div>
  );
}

function isJoining(event: UpcomingEvent) {
  return (
    event.willRecord ||
    event.hasCancellableBooking ||
    event.joinOverride === true
  );
}
