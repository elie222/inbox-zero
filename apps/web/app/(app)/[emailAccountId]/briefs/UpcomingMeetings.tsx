"use client";

import { useCallback, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { CalendarIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toastSuccess, toastError } from "@/components/Toast";
import { LoadingContent } from "@/components/LoadingContent";
import { useAction } from "next-safe-action/hooks";
import { sendBriefAction } from "@/utils/actions/meeting-briefs";
import { useMeetingBriefsHistory } from "@/hooks/useMeetingBriefs";
import { useCalendarUpcomingEvents } from "@/hooks/useCalendarUpcomingEvents";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemGroup,
  ItemMedia,
} from "@/components/ui/item";
import { TypographyH3 } from "@/components/Typography";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Skeleton } from "@/components/ui/skeleton";

export function UpcomingMeetings({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const { data, isLoading, error } = useCalendarUpcomingEvents();
  const [sendingEventId, setSendingEventId] = useState<string | null>(null);

  const { execute } = useAction(sendBriefAction.bind(null, emailAccountId), {
    onSuccess: ({ data: result }) => {
      toastSuccess({
        description: result.message || "Test brief sent!",
      });
    },
    onError: ({ error }) => {
      toastError({
        description: error.serverError || "Failed to send brief",
      });
    },
    onSettled: () => {
      setSendingEventId(null);
    },
  });

  const handleSendTestBrief = useCallback(
    (event: NonNullable<typeof data>["events"][number]) => {
      setSendingEventId(event.id);
      execute({
        event: {
          id: event.id,
          title: event.title,
          description: event.description,
          location: event.location,
          eventUrl: event.eventUrl,
          videoConferenceLink: event.videoConferenceLink,
          startTime: new Date(event.startTime).toISOString(),
          endTime: new Date(event.endTime).toISOString(),
          attendees: event.attendees,
        },
      });
    },
    [execute],
  );

  return (
    <>
      <TypographyH3>Upcoming Meetings</TypographyH3>

      <LoadingContent loading={isLoading} error={error}>
        {!data?.events.length ? (
          <Item variant="outline" className="mt-4">
            <ItemMedia>
              <CalendarIcon className="size-4" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>No upcoming calendar events found</ItemTitle>
            </ItemContent>
          </Item>
        ) : (
          <>
            <ItemGroup className="mt-4 gap-2">
              {data?.events.map((event) => (
                <Item key={event.id} variant="outline">
                  <ItemContent>
                    <ItemTitle>{event.title}</ItemTitle>
                    <ItemDescription>
                      {format(
                        new Date(event.startTime),
                        "EEE, MMM d 'at' h:mm a",
                      )}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <ConfirmDialog
                      trigger={
                        <Button
                          variant="outline"
                          size="sm"
                          Icon={SendIcon}
                          loading={sendingEventId === event.id}
                        >
                          Send test brief
                        </Button>
                      }
                      title="Send test brief?"
                      description="This will send you a briefing email for this meeting now. Use this to verify briefs are working correctly."
                      confirmText="Send"
                      onConfirm={() => handleSendTestBrief(event)}
                    />
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>

            <div className="mt-4">
              <SendHistoryLink />
            </div>
          </>
        )}
      </LoadingContent>
    </>
  );
}

function SendHistoryLink() {
  const { data, isLoading, error } = useMeetingBriefsHistory();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="link" className="h-auto p-0 text-muted-foreground">
          View send history →
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send History</DialogTitle>
        </DialogHeader>

        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-10 w-full" />}
        >
          {!data?.briefings.length ? (
            <Item variant="outline" className="mt-4">
              <ItemMedia>
                <CalendarIcon className="size-4" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>No briefings have been sent yet</ItemTitle>
              </ItemContent>
            </Item>
          ) : (
            <ItemGroup className="mt-2 gap-2">
              {data?.briefings.map((briefing) => (
                <Item key={briefing.id} variant="outline">
                  <ItemContent>
                    <ItemTitle>{briefing.eventTitle}</ItemTitle>
                    <ItemDescription>
                      {briefing.guestCount} guest
                      {briefing.guestCount !== 1 ? "s" : ""} •{" "}
                      {formatDistanceToNow(new Date(briefing.createdAt), {
                        addSuffix: true,
                      })}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        briefing.status === "SENT"
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                      }`}
                    >
                      {briefing.status}
                    </span>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
        </LoadingContent>
      </DialogContent>
    </Dialog>
  );
}
