import { ThreadTrackerType } from "@prisma/client";
import { ReplyTrackerEmails } from "./ReplyTrackerEmails";
import { getPaginatedThreadTrackers } from "./fetch-trackers";
import type { TimeRange } from "./date-filter";

export async function NeedsReply({
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
    type: ThreadTrackerType.NEEDS_REPLY,
    page,
    timeRange,
  });

  return (
    <ReplyTrackerEmails
      trackers={trackers}
      email={email}
      type={ThreadTrackerType.NEEDS_REPLY}
      totalPages={totalPages}
      isAnalyzing={isAnalyzing}
    />
  );
}
