import { ThreadTrackerType } from "@prisma/client";
import { ReplyTrackerEmails } from "./ReplyTrackerEmails";
import { getPaginatedThreadTrackers } from "./fetch-trackers";
import type { TimeRange } from "./date-filter";

export async function AwaitingReply({
  email,
  page,
  timeRange,
  isAnalyzing,
}: {
  email: string;
  page: number;
  timeRange: TimeRange;
  isAnalyzing: boolean;
}) {
  const { trackers, totalPages } = await getPaginatedThreadTrackers({
    email,
    type: ThreadTrackerType.AWAITING,
    page,
    timeRange,
  });

  return (
    <ReplyTrackerEmails
      trackers={trackers}
      email={email}
      type={ThreadTrackerType.AWAITING}
      totalPages={totalPages}
      isAnalyzing={isAnalyzing}
    />
  );
}
