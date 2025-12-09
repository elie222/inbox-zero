import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailProvider } from "@/utils/middleware";
import type { EmailProvider } from "@/utils/email/types";
import { format } from "date-fns/format";
import { startOfWeek } from "date-fns/startOfWeek";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import {
  calculateResponseTimes,
  calculateSummaryStats,
  calculateDistribution,
  calculateMedian,
  type ResponseTimeEntry,
  type SummaryStats,
  type DistributionStats,
} from "./calculate";

const responseTimeSchema = z.object({
  fromDate: z.coerce.number().nullish(),
  toDate: z.coerce.number().nullish(),
});
export type ResponseTimeParams = z.infer<typeof responseTimeSchema>;

const MAX_SENT_MESSAGES = 50;
const MAX_RESPONSE_TIME_MS = 2_147_483_647; // Max Int32, ~24 days

interface TrendEntry {
  period: string;
  periodDate: Date;
  medianResponseTime: number;
  count: number;
}

export type GetResponseTimeResponse = Awaited<
  ReturnType<typeof getResponseTimeStats>
>;

export const GET = withEmailProvider("response-time-stats", async (request) => {
  const { searchParams } = new URL(request.url);
  const params = responseTimeSchema.parse({
    fromDate: searchParams.get("fromDate"),
    toDate: searchParams.get("toDate"),
  });

  const result = await getResponseTimeStats({
    ...params,
    emailAccountId: request.auth.emailAccountId,
    emailProvider: request.emailProvider,
    logger: request.logger,
  });

  return NextResponse.json(result);
});

async function getResponseTimeStats({
  fromDate,
  toDate,
  emailAccountId,
  emailProvider,
  logger,
}: ResponseTimeParams & {
  emailAccountId: string;
  emailProvider: EmailProvider;
  logger: Logger;
}): Promise<{
  summary: SummaryStats;
  distribution: DistributionStats;
  trend: TrendEntry[];
  emailsAnalyzed: number;
  maxEmailsCap: number;
}> {
  // 1. Fetch sent message IDs (lightweight - just id and threadId)
  const sentMessages = await emailProvider.getSentMessageIds({
    maxResults: MAX_SENT_MESSAGES,
    ...(fromDate ? { after: new Date(fromDate) } : {}),
    ...(toDate ? { before: new Date(toDate) } : {}),
  });

  if (!sentMessages.length) {
    return getEmptyStats();
  }

  const sentMessageIds = sentMessages.map((m) => m.id);

  // 2. Check which sent messages are already cached
  const cachedEntries = await prisma.responseTime.findMany({
    where: {
      emailAccountId,
      sentMessageId: { in: sentMessageIds },
    },
    select: {
      threadId: true,
      sentMessageId: true,
      receivedMessageId: true,
      receivedAt: true,
      sentAt: true,
      responseTimeMs: true,
    },
  });

  const cachedSentMessageIds = new Set(
    cachedEntries.map((e) => e.sentMessageId),
  );

  // 3. Filter to uncached sent messages
  const uncachedMessages = sentMessages.filter(
    (m) => !cachedSentMessageIds.has(m.id),
  );

  // 4. Calculate response times only for uncached messages
  let newEntries: ResponseTimeEntry[] = [];
  if (uncachedMessages.length > 0) {
    const { responseTimes: calculated } = await calculateResponseTimes(
      uncachedMessages,
      emailProvider,
      logger,
    );

    // 5. Store new calculations to DB
    if (calculated.length > 0) {
      await prisma.responseTime.createMany({
        data: calculated.map((rt) => ({
          emailAccountId,
          threadId: rt.threadId,
          sentMessageId: rt.sentMessageId,
          receivedMessageId: rt.receivedMessageId,
          receivedAt: rt.receivedAt,
          sentAt: rt.sentAt,
          responseTimeMs: Math.min(
            Number(rt.responseTimeMs),
            MAX_RESPONSE_TIME_MS,
          ),
        })),
        skipDuplicates: true,
      });
      newEntries = calculated;
    }
  }

  // 6. Combine cached + new and filter to date range
  const combinedEntries: ResponseTimeEntry[] = [
    ...cachedEntries,
    ...newEntries,
  ];

  // Filter to only include response times within the requested date range
  const allEntries = combinedEntries.filter((entry) => {
    const sentTime = entry.sentAt.getTime();
    if (fromDate && sentTime < fromDate) return false;
    if (toDate && sentTime > toDate) return false;
    return true;
  });

  if (allEntries.length === 0) {
    return getEmptyStats();
  }

  // 7. Calculate derived statistics
  const summary = calculateSummaryStats(allEntries);

  const distribution = calculateDistribution(allEntries);
  const trend = calculateTrend(allEntries);

  return {
    summary,
    distribution,
    trend,
    emailsAnalyzed: allEntries.length,
    maxEmailsCap: MAX_SENT_MESSAGES,
  };
}

// Helper to convert ms to minutes (handles bigint from Prisma until regenerated)
const msToMinutes = (ms: number | bigint) => Number(ms) / (1000 * 60);

function calculateTrend(responseTimes: ResponseTimeEntry[]): TrendEntry[] {
  const trendMap = new Map<string, { values: number[]; date: Date }>();

  for (const rt of responseTimes) {
    const weekStart = startOfWeek(rt.sentAt);
    const key = format(weekStart, "yyyy-MM-dd");

    if (!trendMap.has(key)) {
      trendMap.set(key, { values: [], date: weekStart });
    }
    trendMap.get(key)!.values.push(msToMinutes(rt.responseTimeMs));
  }

  return Array.from(trendMap.entries())
    .map(([_, { values, date }]) => {
      const median = calculateMedian(values);

      return {
        period: format(date, "LLL dd, y"),
        periodDate: date,
        medianResponseTime: Math.round(median),
        count: values.length,
      };
    })
    .sort((a, b) => a.periodDate.getTime() - b.periodDate.getTime());
}

function getEmptyStats() {
  return {
    summary: {
      medianResponseTime: 0,
      averageResponseTime: 0,
      within1Hour: 0,
      previousPeriodComparison: null,
    },
    distribution: {
      lessThan1Hour: 0,
      oneToFourHours: 0,
      fourTo24Hours: 0,
      oneToThreeDays: 0,
      threeToSevenDays: 0,
      moreThan7Days: 0,
    },
    trend: [],
    emailsAnalyzed: 0,
    maxEmailsCap: MAX_SENT_MESSAGES,
  };
}
