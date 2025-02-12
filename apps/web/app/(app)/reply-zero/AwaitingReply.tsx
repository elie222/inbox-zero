import { ThreadTrackerType } from "@prisma/client";
import { ReplyTrackerEmails } from "./ReplyTrackerEmails";
import { getPaginatedThreadTrackers } from "./fetch-trackers";
import type { TimeRange } from "./date-filter";

export async function AwaitingReply({
  userId,
  userEmail,
  page,
  timeRange,
  isAnalyzing,
}: {
  userId: string;
  userEmail: string;
  page: number;
  timeRange: TimeRange;
  isAnalyzing: boolean;
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
      isAnalyzing={isAnalyzing}
    />
  );
}
