import prisma from "@/utils/prisma";
import { ReplyTrackerEmails } from "./ReplyTrackerEmails";
import { getDateFilter, type TimeRange } from "./date-filter";
import { Prisma } from "@prisma/client";

const PAGE_SIZE = 20;

export async function Resolved({
  emailAccountId,
  userEmail,
  page,
  timeRange,
}: {
  emailAccountId: string;
  userEmail: string;
  page: number;
  timeRange: TimeRange;
}) {
  const skip = (page - 1) * PAGE_SIZE;
  const dateFilter = getDateFilter(timeRange);

  // Group by threadId and check if all resolved values are true
  const [resolvedThreadTrackers, total] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string }>>`
      SELECT MAX(id) as id
      FROM "ThreadTracker"
      WHERE "emailAccountId" = ${emailAccountId}
      ${dateFilter ? Prisma.sql`AND "sentAt" <= (${dateFilter}->>'lte')::timestamp` : Prisma.empty}
      GROUP BY "threadId"
      HAVING bool_and(resolved) = true
      ORDER BY MAX(id) DESC
      LIMIT ${PAGE_SIZE}
      OFFSET ${skip}
    `,
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT "threadId") as count
      FROM "ThreadTracker"
      WHERE "emailAccountId" = ${emailAccountId}
      ${dateFilter ? Prisma.sql`AND "sentAt" <= (${dateFilter}->>'lte')::timestamp` : Prisma.empty}
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
      emailAccountId={emailAccountId}
      userEmail={userEmail}
      totalPages={totalPages}
      isResolved
      isAnalyzing={false}
    />
  );
}
