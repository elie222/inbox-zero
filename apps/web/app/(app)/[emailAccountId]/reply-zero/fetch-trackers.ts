import prisma from "@/utils/prisma";
import type { ThreadTrackerType } from "@prisma/client";
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

  const [trackers, total] = await Promise.all([
    prisma.threadTracker.findMany({
      where: {
        emailAccountId,
        resolved: false,
        type,
        sentAt: dateFilter,
      },
      orderBy: {
        createdAt: "desc",
      },
      distinct: ["threadId"],
      take: PAGE_SIZE,
      skip,
    }),
    dateFilter
      ? prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(DISTINCT "threadId") as count
          FROM "ThreadTracker"
          WHERE "emailAccountId" = ${emailAccountId}
            AND "resolved" = false
            AND "type" = ${type}::text::"ThreadTrackerType"
            AND "sentAt" <= ${dateFilter.lte}
        `
      : prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(DISTINCT "threadId") as count
          FROM "ThreadTracker"
          WHERE "emailAccountId" = ${emailAccountId}
            AND "resolved" = false
            AND "type" = ${type}::text::"ThreadTrackerType"
        `,
  ]);

  const count = Number(total?.[0]?.count);

  const totalPages = Math.ceil(count / PAGE_SIZE);

  return { trackers, totalPages, count };
}
