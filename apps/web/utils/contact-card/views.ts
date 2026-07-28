import { startOfDay, subDays } from "date-fns";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { getClientIp, hashRateLimitValue } from "@/utils/rate-limit";

const TREND_DAYS = 30;

// One counted view per visitor per day. The visitor is identified by a salted
// digest of IP + user agent, so the stats never hold an address, and a
// refresh (or a second tab) doesn't inflate the count.
export async function recordContactCardView({
  slug,
  headers,
  logger,
}: {
  slug: string;
  headers: Headers;
  logger: Logger;
}): Promise<{ counted: boolean }> {
  const card = await prisma.contactCard.findFirst({
    where: { slug, isActive: true },
    select: { id: true },
  });
  if (!card) return { counted: false };

  const visitorHash = hashRateLimitValue(
    `${getClientIp(headers)}|${headers.get("user-agent") ?? ""}`,
  );

  try {
    await prisma.contactCardView.create({
      data: {
        contactCardId: card.id,
        visitorHash,
        day: startOfDay(new Date()),
        referrer: normalizeReferrer(headers.get("referer")),
      },
    });
    return { counted: true };
  } catch (error) {
    // The unique index is the dedupe: this visitor already counted today
    if (isDuplicateError(error)) return { counted: false };

    logger.warn("Failed to record contact card view", { slug, error });
    return { counted: false };
  }
}

export type ContactCardStats = {
  totalViews: number;
  uniqueVisitors: number;
  // Oldest first, one entry per day in the window including zeroes, so the
  // chart doesn't have to reconstruct missing days
  daily: { day: string; views: number }[];
};

export async function getContactCardStats(
  contactCardId: string,
): Promise<ContactCardStats> {
  const since = startOfDay(subDays(new Date(), TREND_DAYS - 1));

  const [totalViews, distinctVisitors, windowViews] = await Promise.all([
    prisma.contactCardView.count({ where: { contactCardId } }),
    prisma.contactCardView.findMany({
      where: { contactCardId },
      select: { visitorHash: true },
      distinct: ["visitorHash"],
    }),
    prisma.contactCardView.groupBy({
      by: ["day"],
      where: { contactCardId, day: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  const viewsByDay = new Map(
    windowViews.map((row) => [toDayKey(row.day), row._count._all]),
  );

  const daily = Array.from({ length: TREND_DAYS }, (_, index) => {
    const day = toDayKey(
      subDays(startOfDay(new Date()), TREND_DAYS - 1 - index),
    );
    return { day, views: viewsByDay.get(day) ?? 0 };
  });

  return {
    totalViews,
    uniqueVisitors: distinctVisitors.length,
    daily,
  };
}

function toDayKey(day: Date) {
  return day.toISOString().slice(0, 10);
}

// Just the origin: a full referring URL can carry query strings the visitor
// didn't mean to hand over
function normalizeReferrer(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).origin;
  } catch {
    return null;
  }
}
