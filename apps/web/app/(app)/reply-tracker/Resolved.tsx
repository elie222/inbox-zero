import prisma from "@/utils/prisma";
import { ReplyTrackerEmails } from "@/app/(app)/reply-tracker/ReplyTrackerEmails";

export async function Resolved({
  userId,
  userEmail,
}: {
  userId: string;
  userEmail: string;
}) {
  const trackers = await prisma.threadTracker.findMany({
    where: {
      userId,
      resolved: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    distinct: ["threadId"],
  });

  return <ReplyTrackerEmails trackers={trackers} userEmail={userEmail} />;
}
