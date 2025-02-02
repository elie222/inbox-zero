import prisma from "@/utils/prisma";
import { ThreadTrackerType } from "@prisma/client";
import { ReplyTrackerEmails } from "@/app/(app)/reply-tracker/ReplyTrackerEmails";

export async function NeedsAction({
  userId,
  userEmail,
}: {
  userId: string;
  userEmail: string;
}) {
  const trackers = await prisma.threadTracker.findMany({
    where: {
      userId,
      resolved: false,
      type: ThreadTrackerType.NEEDS_ACTION,
    },
    orderBy: {
      createdAt: "desc",
    },
    distinct: ["threadId"],
  });

  return <ReplyTrackerEmails trackers={trackers} userEmail={userEmail} />;
}
