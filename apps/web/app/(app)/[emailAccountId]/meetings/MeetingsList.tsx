"use client";

import { useState } from "react";
import { format } from "date-fns";
import { MicIcon } from "lucide-react";
import { LoadingContent } from "@/components/LoadingContent";
import { TypographyH3 } from "@/components/Typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { getRecordingStatusBadge } from "@/app/(app)/[emailAccountId]/meetings/recording-status";
import { MeetingDetail } from "@/app/(app)/[emailAccountId]/meetings/MeetingDetail";
import { useMeetingRecorderMeetings } from "@/hooks/useMeetingRecorder";

export function MeetingsList() {
  const { data, isLoading, error } = useMeetingRecorderMeetings();
  const [openMeetingId, setOpenMeetingId] = useState<string | null>(null);

  return (
    <div>
      <TypographyH3>Recorded</TypographyH3>

      <LoadingContent
        loading={isLoading}
        error={error}
        loadingComponent={<Skeleton className="mt-4 h-24 w-full" />}
      >
        {!data?.meetings.length ? (
          <Empty className="mt-4 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MicIcon />
              </EmptyMedia>
              <EmptyTitle>No meetings recorded yet</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup className="mt-4 gap-2">
            {data.meetings.map((meeting) => {
              const badge = getRecordingStatusBadge(meeting.recording?.status);

              return (
                <Item key={meeting.id} variant="outline">
                  <ItemContent>
                    <ItemTitle>{meeting.eventTitle}</ItemTitle>
                    <ItemDescription>
                      {format(
                        new Date(meeting.startTime),
                        "EEE, MMM d 'at' h:mm a",
                      )}
                      {meeting.recording?.failureReason
                        ? ` • ${meeting.recording.failureReason}`
                        : ""}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions className="gap-3">
                    {badge && (
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => setOpenMeetingId(meeting.id)}
                    >
                      View notes
                    </Button>
                  </ItemActions>
                </Item>
              );
            })}
          </ItemGroup>
        )}
      </LoadingContent>

      <MeetingDetail
        meetingId={openMeetingId}
        onClose={() => setOpenMeetingId(null)}
      />
    </div>
  );
}
