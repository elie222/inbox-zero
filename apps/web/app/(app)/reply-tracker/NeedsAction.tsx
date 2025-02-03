import { ThreadTrackerType } from "@prisma/client";
import { ReplyTrackerEmails } from "@/app/(app)/reply-tracker/ReplyTrackerEmails";
import { getPaginatedThreadTrackers } from "@/app/(app)/reply-tracker/fetch-trackers";

export async function NeedsAction({
  userId,
  userEmail,
  page,
}: {
  userId: string;
  userEmail: string;
  page: number;
}) {
  const { trackers, totalPages } = await getPaginatedThreadTrackers({
    userId,
    type: ThreadTrackerType.NEEDS_ACTION,
    page,
  });

  return (
    <ReplyTrackerEmails
      trackers={trackers}
      userEmail={userEmail}
      type={ThreadTrackerType.NEEDS_ACTION}
      totalPages={totalPages}
    />
  );
}
