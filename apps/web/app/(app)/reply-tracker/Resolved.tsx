import prisma from "@/utils/prisma";
import { ReplyTrackerEmails } from "@/app/(app)/reply-tracker/ReplyTrackerEmails";

export async function Resolved({
  userId,
  userEmail,
}: {
  userId: string;
  userEmail: string;
}) {
  // Group by threadId and check if all resolved values are true
  const resolvedThreadTrackers = await prisma.$queryRaw<Array<{ id: string }>>`
SELECT MAX(id) as id
FROM "ThreadTracker"
WHERE "userId" = ${userId}
GROUP BY "threadId"
HAVING bool_and(resolved) = true
`;

  const trackers = await prisma.threadTracker.findMany({
    where: {
      id: { in: resolvedThreadTrackers.map((t) => t.id) },
    },
    orderBy: { createdAt: "desc" },
  });

  return <ReplyTrackerEmails trackers={trackers} userEmail={userEmail} />;
}
