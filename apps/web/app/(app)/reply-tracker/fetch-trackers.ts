import prisma from "@/utils/prisma";
import type { ThreadTrackerType } from "@prisma/client";
import type { TimeRange } from "./TimeRangeFilter";

const PAGE_SIZE = 20;

function getDateFilter(timeRange: TimeRange) {
  if (timeRange === "all") return undefined;

  const now = new Date();
  switch (timeRange) {
    case "3d":
      now.setDate(now.getDate() - 3);
      break;
    case "1w":
      now.setDate(now.getDate() - 7);
      break;
    case "2w":
      now.setDate(now.getDate() - 14);
      break;
    case "1m":
      now.setMonth(now.getMonth() - 1);
      break;
  }
  return { lte: now };
}

export async function getPaginatedThreadTrackers({
  userId,
  type,
  page,
  timeRange = "all",
}: {
  userId: string;
  type: ThreadTrackerType;
  page: number;
  timeRange?: TimeRange;
}) {
  const skip = (page - 1) * PAGE_SIZE;
  const dateFilter = getDateFilter(timeRange);

  const [trackers, total] = await Promise.all([
    prisma.threadTracker.findMany({
      where: {
        userId,
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
          WHERE "userId" = ${userId}
            AND "resolved" = false
            AND "type" = ${type}::text::"ThreadTrackerType"
            AND "sentAt" <= ${dateFilter.lte}
        `
      : prisma.$queryRaw<[{ count: bigint }]>`
          SELECT COUNT(DISTINCT "threadId") as count
          FROM "ThreadTracker"
          WHERE "userId" = ${userId}
            AND "resolved" = false
            AND "type" = ${type}::text::"ThreadTrackerType"
        `,
  ]);

  const totalPages = Math.ceil(Number(total?.[0]?.count) / PAGE_SIZE);

  return { trackers, totalPages };
}
