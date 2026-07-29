"use client";

import { useAccount } from "@/providers/EmailAccountProvider";
import { useState } from "react";
import { MicIcon } from "lucide-react";
import { ListCard } from "@/components/ListCard";
import { LoadingContent } from "@/components/LoadingContent";
import { MutedText, TypographyH3 } from "@/components/Typography";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { MeetingDetail } from "@/app/(app)/[emailAccountId]/meetings/MeetingDetail";
import { MeetingListItem } from "@/app/(app)/[emailAccountId]/meetings/MeetingListItem";
import { useMeetingRecorderMeetings } from "@/hooks/useMeetingRecorder";

export function MeetingsList() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error } = useMeetingRecorderMeetings(emailAccountId);
  const [openMeetingId, setOpenMeetingId] = useState<string | null>(null);

  const draftsWaiting =
    data?.meetings.filter((meeting) => meeting.followUpDraftId).length ?? 0;

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <TypographyH3>Recorded</TypographyH3>
        {draftsWaiting > 0 && (
          <MutedText>
            {`${draftsWaiting} follow-up${draftsWaiting === 1 ? "" : "s"} waiting in your drafts`}
          </MutedText>
        )}
      </div>

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
              <EmptyDescription>
                Notes, action items and a follow-up draft show up here once your
                first call has been recorded.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ListCard className="mt-4">
            {data.meetings.map((meeting) => (
              <MeetingListItem
                key={meeting.id}
                title={meeting.eventTitle}
                startTime={meeting.startTime}
                status={meeting.recording?.status}
                failureReason={meeting.recording?.failureReason}
                onClick={() => setOpenMeetingId(meeting.id)}
              >
                {meeting.followUpDraftId && (
                  <Badge variant="secondary">Draft ready</Badge>
                )}
              </MeetingListItem>
            ))}
          </ListCard>
        )}
      </LoadingContent>

      <MeetingDetail
        meetingId={openMeetingId}
        onClose={() => setOpenMeetingId(null)}
      />
    </div>
  );
}
