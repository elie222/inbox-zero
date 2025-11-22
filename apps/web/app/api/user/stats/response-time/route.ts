import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailProvider } from "@/utils/middleware";
import type { EmailProvider } from "@/utils/email/types";
import { format, subDays, differenceInDays, startOfWeek } from "date-fns";
import type { Logger } from "@/utils/logger";
import { extractEmailAddress } from "@/utils/email";

const responseTimeSchema = z.object({
  fromDate: z.coerce.number().nullish(),
  toDate: z.coerce.number().nullish(),
});
export type ResponseTimeParams = z.infer<typeof responseTimeSchema>;

interface ResponseTimeEntry {
  threadId: string;
  receivedDate: Date;
  sentDate: Date;
  responseTimeMinutes: number;
}

interface SummaryStats {
  medianResponseTime: number;
  averageResponseTime: number;
  responseRate: number;
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

export const GET = withEmailProvider("response-time-stats", async (request) => {
  const { searchParams } = new URL(request.url);
  const params = responseTimeSchema.parse({
    fromDate: searchParams.get("fromDate"),
    toDate: searchParams.get("toDate"),
  });

  const result = await getResponseTimeStats({
    ...params,
    emailProvider: request.emailProvider,
    logger: request.logger,
  });

  return NextResponse.json(result);
});

async function getResponseTimeStats({
  fromDate,
  toDate,
  emailProvider,
  logger,
}: ResponseTimeParams & {
  emailProvider: EmailProvider;
  logger: Logger;
}): Promise<{
  summary: SummaryStats;
  distribution: DistributionStats;
  trend: TrendEntry[];
}> {
  // 1. Fetch sent messages to initiate the search
  const sentMessagesResult = await emailProvider.getMessagesByFields({
    type: "sent",
    ...(fromDate ? { after: new Date(fromDate) } : {}),
    ...(toDate ? { before: new Date(toDate) } : {}),
    maxResults: 100,
  });

  if (!sentMessagesResult.messages.length) {
    return getEmptyStats();
  }

  // 2. Calculate raw response times
  const responseTimes = await calculateResponseTimes(
    sentMessagesResult.messages,
    emailProvider,
    logger,
  );

  if (responseTimes.length === 0) {
    return getEmptyStats();
  }

  // 3. Calculate derived statistics
  const summary = await calculateSummaryStats(
    responseTimes,
    fromDate,
    toDate,
    emailProvider,
    logger,
  );
  const distribution = calculateDistribution(responseTimes);
  const trend = calculateTrend(responseTimes);

  return {
    summary,
    distribution,
    trend,
  };
}

export async function calculateResponseTimes(
  sentMessages: any[],
  emailProvider: EmailProvider,
  logger: Logger,
): Promise<ResponseTimeEntry[]> {
  const responseTimes: ResponseTimeEntry[] = [];
  const processedThreads = new Set<string>();

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

      let lastReceivedDate: Date | null = null;

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
        if (!isSent) {
          // Optimize: check id match
          if (sentMessages.some((sm: any) => sm.id === message.id)) {
            isSent = true;
          }
        }

        if (isSent) {
          // Message is SENT
          if (lastReceivedDate) {
            const diff = messageDate.getTime() - lastReceivedDate.getTime();
            // Check bounds - only if valid positive diff
            if (diff > 0) {
              responseTimes.push({
                threadId: sentMsg.threadId,
                receivedDate: lastReceivedDate,
                sentDate: messageDate,
                responseTimeMinutes: diff / (1000 * 60),
              });
            }
            // Reset lastReceivedDate because this sent message has now "responded" to the previous received message.
            lastReceivedDate = null;
          }
        } else {
          // Message is RECEIVED
          lastReceivedDate = messageDate;
        }
      }
    } catch (error) {
      logger.error(`Failed to process thread ${sentMsg.threadId}`, { error });
    }
  }

  return responseTimes;
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

async function calculatePreviousPeriodComparison(
  fromDate: number | null | undefined,
  toDate: number | null | undefined,
  currentMedian: number,
  emailProvider: EmailProvider,
  logger: Logger,
): Promise<SummaryStats["previousPeriodComparison"]> {
  if (!fromDate || !toDate) return null;

  const currentDays = differenceInDays(new Date(toDate), new Date(fromDate));
  const prevFrom = subDays(new Date(fromDate), currentDays);
  const prevTo = new Date(fromDate);

  const prevStats = await getResponseTimeStats({
    fromDate: prevFrom.getTime(),
    toDate: prevTo.getTime(),
    emailProvider,
    logger,
  });

  if (prevStats.summary.medianResponseTime > 0) {
    const prevMedian = prevStats.summary.medianResponseTime;
    const change = ((currentMedian - prevMedian) / prevMedian) * 100;
    return {
      medianResponseTime: prevMedian,
      percentChange: Math.round(change),
    };
  }
  return null;
}

export async function calculateSummaryStats(
  responseTimes: ResponseTimeEntry[],
  fromDate: number | null | undefined,
  toDate: number | null | undefined,
  emailProvider: EmailProvider,
  logger: Logger,
): Promise<SummaryStats> {
  const values = responseTimes.map((r) => r.responseTimeMinutes);

  const medianResponseTime = calculateMedian(values);
  const averageResponseTime = calculateAverage(values);
  const within1Hour = calculateWithin1Hour(values);

  const previousPeriodComparison = await calculatePreviousPeriodComparison(
    fromDate,
    toDate,
    medianResponseTime,
    emailProvider,
    logger,
  );

  return {
    medianResponseTime: Math.round(medianResponseTime),
    averageResponseTime: Math.round(averageResponseTime),
    responseRate: 100,
    within1Hour: Math.round(within1Hour),
    previousPeriodComparison,
  };
}

export function calculateDistribution(
  responseTimes: ResponseTimeEntry[],
): DistributionStats {
  const values = responseTimes.map((r) => r.responseTimeMinutes);
  return {
    lessThan1Hour: values.filter((v) => v < 60).length,
    oneToFourHours: values.filter((v) => v >= 60 && v < 240).length,
    fourTo24Hours: values.filter((v) => v >= 240 && v < 1440).length,
    oneToThreeDays: values.filter((v) => v >= 1440 && v < 4320).length,
    threeToSevenDays: values.filter((v) => v >= 4320 && v < 10_080).length,
    moreThan7Days: values.filter((v) => v >= 10_080).length,
  };
}

export function calculateTrend(
  responseTimes: ResponseTimeEntry[],
): TrendEntry[] {
  const trendMap = new Map<string, { values: number[]; date: Date }>();

  for (const rt of responseTimes) {
    const weekStart = startOfWeek(rt.sentDate);
    const key = format(weekStart, "yyyy-MM-dd");

    if (!trendMap.has(key)) {
      trendMap.set(key, { values: [], date: weekStart });
    }
    trendMap.get(key)!.values.push(rt.responseTimeMinutes);
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
      responseRate: 0,
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
  };
}
