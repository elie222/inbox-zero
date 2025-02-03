import { ThreadTrackerType } from "@prisma/client";
import { ReplyTrackerEmails } from "@/app/(app)/reply-tracker/ReplyTrackerEmails";
import { getPaginatedThreadTrackers } from "@/app/(app)/reply-tracker/fetch-trackers";
import type { TimeRange } from "@/app/(app)/reply-tracker/TimeRangeFilter";

export async function AwaitingReply({
  userId,
  userEmail,
  page,
  timeRange,
}: {
  userId: string;
  userEmail: string;
  page: number;
  timeRange: TimeRange;
}) {
  const { trackers, totalPages } = await getPaginatedThreadTrackers({
    userId,
    type: ThreadTrackerType.AWAITING,
    page,
    timeRange,
  });

  return (
    <ReplyTrackerEmails
      trackers={trackers}
      userEmail={userEmail}
      type={ThreadTrackerType.AWAITING}
      totalPages={totalPages}
    />
  );
}
