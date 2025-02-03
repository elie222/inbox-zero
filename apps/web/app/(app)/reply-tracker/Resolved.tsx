import prisma from "@/utils/prisma";
import { ReplyTrackerEmails } from "@/app/(app)/reply-tracker/ReplyTrackerEmails";

const PAGE_SIZE = 20;

export async function Resolved({
  userId,
  userEmail,
  page,
}: {
  userId: string;
  userEmail: string;
  page: number;
}) {
  const skip = (page - 1) * PAGE_SIZE;

  // Group by threadId and check if all resolved values are true
  const [resolvedThreadTrackers, total] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string }>>`
      SELECT MAX(id) as id
      FROM "ThreadTracker"
      WHERE "userId" = ${userId}
      GROUP BY "threadId"
      HAVING bool_and(resolved) = true
      ORDER BY MAX(id) DESC
      LIMIT ${PAGE_SIZE}
      OFFSET ${skip}
    `,
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT "threadId") as count
      FROM "ThreadTracker"
      WHERE "userId" = ${userId}
      GROUP BY "threadId"
      HAVING bool_and(resolved) = true
    `,
  ]);

  const trackers = await prisma.threadTracker.findMany({
    where: {
      id: { in: resolvedThreadTrackers.map((t) => t.id) },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalPages = Math.ceil(Number(total?.[0]?.count) / PAGE_SIZE);

  return (
    <ReplyTrackerEmails
      trackers={trackers}
      userEmail={userEmail}
      totalPages={totalPages}
    />
  );
}
