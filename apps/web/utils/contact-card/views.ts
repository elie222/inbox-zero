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

export const CARD_CLICK_KINDS = [
  "phone",
  "email",
  "save",
  "website",
  "linkedin",
  "x",
  "instagram",
] as const;
export type CardClickKind = (typeof CARD_CLICK_KINDS)[number];

// One row per tap — taps are the engagement signal, so no dedupe. The
// visitor is the same salted digest views use; no raw IPs.
export async function recordContactCardClick({
  slug,
  kind,
  headers,
  logger,
}: {
  slug: string;
  kind: CardClickKind;
  headers: Headers;
  logger: Logger;
}): Promise<void> {
  try {
    const card = await prisma.contactCard.findFirst({
      where: { slug, isActive: true },
      select: { id: true },
    });
    if (!card) return;

    await prisma.contactCardClick.create({
      data: {
        contactCardId: card.id,
        kind,
        visitorHash: hashRateLimitValue(
          `${getClientIp(headers)}|${headers.get("user-agent") ?? ""}`,
        ),
        day: startOfDay(new Date()),
      },
    });
  } catch (error) {
    // Engagement stats must never break the card itself
    logger.warn("Failed to record contact card click", { slug, kind, error });
  }
}

const WINDOW_DAYS = 30;
const TREND_WEEKS = 8;

export type ContactCardEngagement = {
  // Last 30 days, with the percentage change against the 30 before
  views: { total: number; deltaPct: number | null };
  clicks: { total: number; deltaPct: number | null };
  saves: { total: number; deltaPct: number | null };
  // Oldest first, one entry per week
  weekly: { weekStart: string; views: number }[];
  clickBreakdown: { kind: string; count: number }[];
  topReferrer: string | null;
  lastViewedAt: string | null;
};

// Everything the My Card drawer's activity panel shows
export async function getContactCardEngagement(
  contactCardId: string,
): Promise<ContactCardEngagement> {
  const now = new Date();
  const windowStart = startOfDay(subDays(now, WINDOW_DAYS - 1));
  const previousStart = startOfDay(subDays(now, WINDOW_DAYS * 2 - 1));
  const trendStart = startOfDay(subDays(now, TREND_WEEKS * 7 - 1));

  const [viewRows, clickRows, lastView, referrers] = await Promise.all([
    prisma.contactCardView.findMany({
      where: { contactCardId, day: { gte: trendStart } },
      select: { day: true },
    }),
    prisma.contactCardClick.findMany({
      where: { contactCardId, day: { gte: previousStart } },
      select: { day: true, kind: true },
    }),
    prisma.contactCardView.findFirst({
      where: { contactCardId },
      orderBy: { viewedAt: "desc" },
      select: { viewedAt: true },
    }),
    prisma.contactCardView.groupBy({
      by: ["referrer"],
      where: {
        contactCardId,
        day: { gte: windowStart },
        referrer: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { referrer: "desc" } },
      take: 1,
    }),
  ]);

  const inWindow = (day: Date) => day >= windowStart;
  const inPrevious = (day: Date) => day >= previousStart && day < windowStart;

  const viewsNow = viewRows.filter((row) => inWindow(row.day)).length;
  const viewsBefore = viewRows.filter((row) => inPrevious(row.day)).length;

  const saves = clickRows.filter((row) => row.kind === "save");
  const taps = clickRows.filter((row) => row.kind !== "save");

  const weekly = Array.from({ length: TREND_WEEKS }, (_, index) => {
    const weekStart = subDays(startOfDay(now), (TREND_WEEKS - index) * 7 - 1);
    const weekEnd = subDays(startOfDay(now), (TREND_WEEKS - index - 1) * 7 - 1);
    return {
      weekStart: toDayKey(weekStart),
      views: viewRows.filter((row) => row.day >= weekStart && row.day < weekEnd)
        .length,
    };
  });

  const breakdown = new Map<string, number>();
  for (const row of clickRows.filter((row) => inWindow(row.day))) {
    breakdown.set(row.kind, (breakdown.get(row.kind) ?? 0) + 1);
  }

  return {
    views: { total: viewsNow, deltaPct: deltaPct(viewsNow, viewsBefore) },
    clicks: {
      total: taps.filter((row) => inWindow(row.day)).length,
      deltaPct: deltaPct(
        taps.filter((row) => inWindow(row.day)).length,
        taps.filter((row) => inPrevious(row.day)).length,
      ),
    },
    saves: {
      total: saves.filter((row) => inWindow(row.day)).length,
      deltaPct: deltaPct(
        saves.filter((row) => inWindow(row.day)).length,
        saves.filter((row) => inPrevious(row.day)).length,
      ),
    },
    weekly,
    clickBreakdown: [...breakdown.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count),
    topReferrer: referrers[0]?.referrer ?? null,
    lastViewedAt: lastView?.viewedAt.toISOString() ?? null,
  };
}

// Percentage change, or null when there's nothing to compare against
function deltaPct(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
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
