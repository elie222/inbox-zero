import { ThreadTrackerType } from "@prisma/client";
import { ReplyTrackerEmails } from "./ReplyTrackerEmails";
import { getPaginatedThreadTrackers } from "./fetch-trackers";
import type { TimeRange } from "./date-filter";

export async function AwaitingReply({
  emailAccountId,
  userEmail,
  page,
  timeRange,
  isAnalyzing,
}: {
  emailAccountId: string;
  userEmail: string;
  page: number;
  timeRange: TimeRange;
  isAnalyzing: boolean;
}) {
  const { trackers, totalPages } = await getPaginatedThreadTrackers({
    emailAccountId,
    type: ThreadTrackerType.AWAITING,
    page,
    timeRange,
  });

  return (
    <ReplyTrackerEmails
      trackers={trackers}
      emailAccountId={emailAccountId}
      userEmail={userEmail}
      type={ThreadTrackerType.AWAITING}
      totalPages={totalPages}
      isAnalyzing={isAnalyzing}
    />
  );
}
