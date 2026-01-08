import prisma from "@/utils/prisma";
import { Prisma, type ThreadTracker } from "@/generated/prisma/client";
import type { ThreadTrackerType } from "@/generated/prisma/enums";
import { getDateFilter, type TimeRange } from "./date-filter";

const PAGE_SIZE = 20;

export async function getPaginatedThreadTrackers({
  emailAccountId,
  type,
  page,
  timeRange = "all",
}: {
  emailAccountId: string;
  type: ThreadTrackerType;
  page: number;
  timeRange?: TimeRange;
}) {
  const skip = (page - 1) * PAGE_SIZE;
  const dateFilter = getDateFilter(timeRange);

  const dateClause = dateFilter
    ? Prisma.sql`AND "sentAt" <= ${dateFilter.lte}`
    : Prisma.empty;

  const [trackers, total] = await Promise.all([
    prisma.$queryRaw<ThreadTracker[]>`
      SELECT * FROM (
        SELECT DISTINCT ON ("threadId") *
        FROM "ThreadTracker"
        WHERE "emailAccountId" = ${emailAccountId}
          AND "resolved" = false
          AND "type" = ${type}::text::"ThreadTrackerType"
          ${dateClause}
        ORDER BY "threadId", "createdAt" DESC
      ) AS distinct_threads
      ORDER BY "createdAt" DESC
      LIMIT ${PAGE_SIZE}
      OFFSET ${skip}
    `,
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT "threadId") as count
      FROM "ThreadTracker"
      WHERE "emailAccountId" = ${emailAccountId}
        AND "resolved" = false
        AND "type" = ${type}::text::"ThreadTrackerType"
        ${dateClause}
    `,
  ]);

  const count = Number(total?.[0]?.count);

  const totalPages = Math.ceil(count / PAGE_SIZE);

  return { trackers, totalPages, count };
}
