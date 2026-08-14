"use client";

import { useAccount } from "@/providers/EmailAccountProvider";
import { MicIcon } from "lucide-react";
import { ListCard } from "@/components/ListCard";
import { LoadingContent } from "@/components/LoadingContent";
import { TypographyH3 } from "@/components/Typography";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { MeetingListItem } from "@/app/(app)/[emailAccountId]/meetings/MeetingListItem";
import { useMeetingRecorderMeetings } from "@/hooks/useMeetingRecorder";

export function MeetingsList({
  onOpenMeeting,
}: {
  onOpenMeeting: (meetingId: string) => void;
}) {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error } = useMeetingRecorderMeetings(emailAccountId);

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
          <ListCard className="mt-4">
            {data.meetings.map((meeting) => (
              <MeetingListItem
                key={meeting.id}
                title={meeting.eventTitle}
                startTime={meeting.startTime}
                endTime={meeting.endTime}
                status={meeting.recording?.status}
                failureReason={meeting.recording?.failureReason}
                onClick={() => onOpenMeeting(meeting.id)}
              >
                {meeting.followUpDraftId && (
                  <Badge variant="secondary">Draft ready</Badge>
                )}
              </MeetingListItem>
            ))}
          </ListCard>
        )}
      </LoadingContent>
    </div>
  );
}
