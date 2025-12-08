import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailProvider } from "@/utils/middleware";
import type { EmailProvider } from "@/utils/email/types";
import { format } from "date-fns/format";
import { startOfWeek } from "date-fns/startOfWeek";
import type { Logger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";
import type { ResponseTime } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";

const responseTimeSchema = z.object({
  fromDate: z.coerce.number().nullish(),
  toDate: z.coerce.number().nullish(),
});
export type ResponseTimeParams = z.infer<typeof responseTimeSchema>;

const MAX_SENT_MESSAGES = 50;
const MAX_RESPONSE_TIME_MS = 2_147_483_647; // Max Int32, ~24 days

type ResponseTimeEntry = Pick<
  ResponseTime,
  | "threadId"
  | "sentMessageId"
  | "receivedMessageId"
  | "receivedAt"
  | "sentAt"
  | "responseTimeMs"
>;

interface SummaryStats {
  medianResponseTime: number;
  averageResponseTime: number;
  within1Hour: number;
  previousPeriodComparison: {
    medianResponseTime: number;
    percentChange: number;
  } | null;
}

interface DistributionStats {
  lessThan1Hour: number;
  oneToFourHours: number;
  fourTo24Hours: number;
  oneToThreeDays: number;
  threeToSevenDays: number;
  moreThan7Days: number;
}

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
  // 1. Fetch sent messages from email provider
  const sentMessagesResult = await emailProvider.getMessagesByFields({
    type: "sent",
    ...(fromDate ? { after: new Date(fromDate) } : {}),
    ...(toDate ? { before: new Date(toDate) } : {}),
    maxResults: MAX_SENT_MESSAGES,
  });

  if (!sentMessagesResult.messages.length) {
    return getEmptyStats();
  }

  const sentMessageIds = sentMessagesResult.messages.map((m) => m.id);

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
  const uncachedMessages = sentMessagesResult.messages.filter(
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

export async function calculateResponseTimes(
  sentMessages: ParsedMessage[],
  emailProvider: EmailProvider,
  logger: Logger,
): Promise<{
  responseTimes: ResponseTimeEntry[];
  processedThreadsCount: number;
}> {
  const responseTimes: ResponseTimeEntry[] = [];
  const processedThreads = new Set<string>();
  const sentMessageIds = new Set(sentMessages.map((m) => m.id));

  const sentLabelId = "SENT";

  for (const sentMsg of sentMessages) {
    if (!sentMsg.threadId || processedThreads.has(sentMsg.threadId)) continue;
    processedThreads.add(sentMsg.threadId);

    try {
      const threadMessages = await emailProvider.getThreadMessages(
        sentMsg.threadId,
      );

      // Sort by date ascending
      const sortedMessages = threadMessages.sort((a, b) => {
        const dateA = a.internalDate ? new Date(a.internalDate).getTime() : 0;
        const dateB = b.internalDate ? new Date(b.internalDate).getTime() : 0;
        return dateA - dateB;
      });

      let lastReceivedMessage: { id: string; date: Date } | null = null;

      for (const message of sortedMessages) {
        if (!message.internalDate) continue;
        const messageDate = new Date(message.internalDate);

        // Determine if message is sent or received
        let isSent = false;
        if (message.labelIds?.includes(sentLabelId)) {
          isSent = true;
        }

        // If we still haven't matched, fallback to checking if this specific message is in our known sent list
        // (Only efficient if sentMessages is small, but we capped it at 100)
        if (!isSent && sentMessageIds.has(message.id)) {
          isSent = true;
        }

        if (isSent) {
          // Message is SENT
          if (lastReceivedMessage) {
            const diff =
              messageDate.getTime() - lastReceivedMessage.date.getTime();
            // Check bounds - only if valid positive diff
            if (diff > 0) {
              responseTimes.push({
                threadId: sentMsg.threadId,
                sentMessageId: message.id,
                receivedMessageId: lastReceivedMessage.id,
                receivedAt: lastReceivedMessage.date,
                sentAt: messageDate,
                responseTimeMs: diff,
              });
            }
            // Reset because this sent message has now "responded" to the previous received message.
            lastReceivedMessage = null;
          }
        } else {
          // Message is RECEIVED
          lastReceivedMessage = { id: message.id, date: messageDate };
        }
      }
    } catch (error) {
      logger.error(`Failed to process thread ${sentMsg.threadId}`, { error });
    }
  }

  return { responseTimes, processedThreadsCount: processedThreads.size };
}

function calculateMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;

  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function calculateWithin1Hour(values: number[]): number {
  if (values.length === 0) return 0;
  const within1HourCount = values.filter((v) => v <= 60).length;
  return (within1HourCount / values.length) * 100;
}

// Helper to convert ms to minutes (handles bigint from Prisma until regenerated)
const msToMinutes = (ms: number | bigint) => Number(ms) / (1000 * 60);

export function calculateSummaryStats(
  responseTimes: ResponseTimeEntry[],
): SummaryStats {
  const values = responseTimes.map((r) => msToMinutes(r.responseTimeMs));

  const medianResponseTime = calculateMedian(values);
  const averageResponseTime = calculateAverage(values);
  const within1Hour = calculateWithin1Hour(values);

  // TODO: Re-enable previous period comparison with non-recursive implementation
  const previousPeriodComparison = null;

  return {
    medianResponseTime: Math.round(medianResponseTime),
    averageResponseTime: Math.round(averageResponseTime),
    within1Hour: Math.round(within1Hour),
    previousPeriodComparison,
  };
}

export function calculateDistribution(
  responseTimes: ResponseTimeEntry[],
): DistributionStats {
  const values = responseTimes.map((r) => msToMinutes(r.responseTimeMs));

  const distribution: DistributionStats = {
    lessThan1Hour: 0,
    oneToFourHours: 0,
    fourTo24Hours: 0,
    oneToThreeDays: 0,
    threeToSevenDays: 0,
    moreThan7Days: 0,
  };

  for (const v of values) {
    if (v < 60) distribution.lessThan1Hour++;
    else if (v < 240) distribution.oneToFourHours++;
    else if (v < 1440) distribution.fourTo24Hours++;
    else if (v < 4320) distribution.oneToThreeDays++;
    else if (v < 10_080) distribution.threeToSevenDays++;
    else distribution.moreThan7Days++;
  }

  return distribution;
}

export function calculateTrend(
  responseTimes: ResponseTimeEntry[],
): TrendEntry[] {
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
