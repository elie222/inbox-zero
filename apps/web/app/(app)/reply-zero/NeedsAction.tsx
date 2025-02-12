import { ThreadTrackerType } from "@prisma/client";
import { ReplyTrackerEmails } from "./ReplyTrackerEmails";
import { getPaginatedThreadTrackers } from "./fetch-trackers";
import type { TimeRange } from "./date-filter";

export async function NeedsAction({
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
    type: ThreadTrackerType.NEEDS_ACTION,
    page,
    timeRange,
  });

  return (
    <ReplyTrackerEmails
      trackers={trackers}
      userEmail={userEmail}
      type={ThreadTrackerType.NEEDS_ACTION}
      totalPages={totalPages}
      isAnalyzing={isAnalyzing}
    />
  );
}
