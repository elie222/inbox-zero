import prisma from "@/utils/prisma";
import type { ThreadTrackerType } from "@prisma/client";

const PAGE_SIZE = 20;

export async function getPaginatedThreadTrackers({
  userId,
  type,
  page,
}: {
  userId: string;
  type: ThreadTrackerType;
  page: number;
}) {
  const skip = (page - 1) * PAGE_SIZE;

  const [trackers, total] = await Promise.all([
    prisma.threadTracker.findMany({
      where: {
        userId,
        resolved: false,
        type,
      },
      orderBy: {
        createdAt: "desc",
      },
      distinct: ["threadId"],
      take: PAGE_SIZE,
      skip,
    }),
    prisma.$queryRaw<[{ count: bigint }]>`
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
