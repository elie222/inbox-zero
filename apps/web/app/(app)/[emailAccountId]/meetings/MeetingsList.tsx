"use client";

import { useAccount } from "@/providers/EmailAccountProvider";
import { useState } from "react";
import { MicIcon } from "lucide-react";
import { LoadingContent } from "@/components/LoadingContent";
import { TypographyH3 } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ItemGroup } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { MeetingDetail } from "@/app/(app)/[emailAccountId]/meetings/MeetingDetail";
import { MeetingListItem } from "@/app/(app)/[emailAccountId]/meetings/MeetingListItem";
import { useMeetingRecorderMeetings } from "@/hooks/useMeetingRecorder";

export function MeetingsList() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error } = useMeetingRecorderMeetings(emailAccountId);
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
            {data.meetings.map((meeting) => (
              <MeetingListItem
                key={meeting.id}
                title={meeting.eventTitle}
                startTime={meeting.startTime}
                status={meeting.recording?.status}
                failureReason={meeting.recording?.failureReason}
              >
                <Button
                  variant="outline"
                  onClick={() => setOpenMeetingId(meeting.id)}
                >
                  View notes
                </Button>
              </MeetingListItem>
            ))}
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
