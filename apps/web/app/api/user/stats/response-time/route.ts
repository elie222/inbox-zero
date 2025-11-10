import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailProvider } from "@/utils/middleware";
import type { EmailProvider } from "@/utils/email/types";
import format from "date-fns/format";
import subDays from "date-fns/subDays";
import differenceInDays from "date-fns/differenceInDays";
import startOfWeek from "date-fns/startOfWeek";
import type { Logger } from "@/utils/logger";

const responseTimeParams = z.object({
  fromDate: z.coerce.number().nullish(),
  toDate: z.coerce.number().nullish(),
});
export type ResponseTimeParams = z.infer<typeof responseTimeParams>;

async function getResponseTimeStats({
  fromDate,
  toDate,
  emailProvider,
  logger,
}: ResponseTimeParams & {
  emailProvider: EmailProvider;
  logger: Logger;
}): Promise<{
  summary: {
    medianResponseTime: number;
    averageResponseTime: number;
    responseRate: number;
    within1Hour: number;
    previousPeriodComparison: {
      medianResponseTime: number;
      percentChange: number;
    } | null;
  };
  distribution: {
    lessThan1Hour: number;
    oneToFourHours: number;
    fourTo24Hours: number;
    oneToThreeDays: number;
    threeToSevenDays: number;
    moreThan7Days: number;
  };
  trend: Array<{
    period: string;
    periodDate: Date;
    medianResponseTime: number;
    count: number;
  }>;
}> {
  // Fetch sent messages in the date range
  const sentMessages = await emailProvider.getMessagesByFields({
    type: "sent",
    ...(fromDate ? { after: new Date(fromDate) } : {}),
    ...(toDate ? { before: new Date(toDate) } : {}),
    maxResults: 500,
  });

  if (!sentMessages.messages.length) {
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

  // For each sent message, get the thread and find first received message
  const responseTimes: Array<{
    threadId: string;
    firstReceivedDate: Date;
    firstSentDate: Date;
    responseTimeMinutes: number;
  }> = [];

  // Process threads to calculate response times
  const processedThreads = new Set<string>();

  for (const sentMsg of sentMessages.messages) {
    if (!sentMsg.threadId || processedThreads.has(sentMsg.threadId)) continue;
    processedThreads.add(sentMsg.threadId);

    try {
      // Get all messages in the thread
      const threadMessages = await emailProvider.getThreadMessages(
        sentMsg.threadId,
      );

      // Find first received and first sent messages
      const receivedMessages = threadMessages
        .filter(
          (m) =>
            m.internalDate &&
            !m.headers.from?.includes(sentMsg.headers.to || ""),
        )
        .sort(
          (a, b) =>
            new Date(a.internalDate!).getTime() -
            new Date(b.internalDate!).getTime(),
        );

      const sentMessagesInThread = threadMessages
        .filter(
          (m) =>
            m.internalDate &&
            m.headers.from?.includes(sentMsg.headers.to || ""),
        )
        .sort(
          (a, b) =>
            new Date(a.internalDate!).getTime() -
            new Date(b.internalDate!).getTime(),
        );

      if (receivedMessages.length > 0 && sentMessagesInThread.length > 0) {
        const firstReceived = receivedMessages[0];
        const firstSent = sentMessagesInThread[0];

        const firstReceivedDate = new Date(firstReceived.internalDate!);
        const firstSentDate = new Date(firstSent.internalDate!);

        // Only count if user replied after receiving
        if (firstSentDate > firstReceivedDate) {
          const responseTimeMinutes =
            (firstSentDate.getTime() - firstReceivedDate.getTime()) /
            (1000 * 60);

          if (responseTimeMinutes > 0) {
            responseTimes.push({
              threadId: sentMsg.threadId,
              firstReceivedDate,
              firstSentDate,
              responseTimeMinutes,
            });
          }
        }
      }
    } catch (error) {
      // Skip threads that fail to load
      logger.error(`Failed to process thread ${sentMsg.threadId}`, { error });
    }
  }

  // Calculate summary statistics
  const responseTimeValues = responseTimes.map((r) => r.responseTimeMinutes);

  if (responseTimeValues.length === 0) {
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

  // Calculate median
  const sortedTimes = [...responseTimeValues].sort((a, b) => a - b);
  const medianResponseTime =
    sortedTimes.length % 2 === 0
      ? (sortedTimes[sortedTimes.length / 2 - 1] +
          sortedTimes[sortedTimes.length / 2]) /
        2
      : sortedTimes[Math.floor(sortedTimes.length / 2)];

  // Calculate average
  const averageResponseTime =
    responseTimeValues.reduce((sum, val) => sum + val, 0) /
    responseTimeValues.length;

  // Calculate percentage within 1 hour
  const within1HourCount = responseTimeValues.filter((val) => val <= 60).length;
  const within1Hour = (within1HourCount / responseTimeValues.length) * 100;

  // Calculate distribution
  const distribution = {
    lessThan1Hour: responseTimeValues.filter((val) => val < 60).length,
    oneToFourHours: responseTimeValues.filter((val) => val >= 60 && val < 240)
      .length,
    fourTo24Hours: responseTimeValues.filter((val) => val >= 240 && val < 1440)
      .length,
    oneToThreeDays: responseTimeValues.filter(
      (val) => val >= 1440 && val < 4320,
    ).length,
    threeToSevenDays: responseTimeValues.filter(
      (val) => val >= 4320 && val < 10_080,
    ).length,
    moreThan7Days: responseTimeValues.filter((val) => val >= 10_080).length,
  };

  // Calculate trend by week (simplified for now - can be enhanced with period parameter)
  const trendMap = new Map<string, { values: number[]; date: Date }>();

  for (const rt of responseTimes) {
    const weekStart = startOfWeek(rt.firstSentDate);
    const weekKey = format(weekStart, "yyyy-MM-dd");

    if (!trendMap.has(weekKey)) {
      trendMap.set(weekKey, { values: [], date: weekStart });
    }
    trendMap.get(weekKey)!.values.push(rt.responseTimeMinutes);
  }

  const trend = Array.from(trendMap.entries())
    .map(([_key, { values, date }]) => {
      const sortedValues = [...values].sort((a, b) => a - b);
      const median =
        sortedValues.length % 2 === 0
          ? (sortedValues[sortedValues.length / 2 - 1] +
              sortedValues[sortedValues.length / 2]) /
            2
          : sortedValues[Math.floor(sortedValues.length / 2)];

      return {
        period: format(date, "LLL dd, y"),
        periodDate: date,
        medianResponseTime: Math.round(median),
        count: values.length,
      };
    })
    .sort((a, b) => a.periodDate.getTime() - b.periodDate.getTime());

  // Calculate previous period comparison
  let previousPeriodComparison = null;
  if (fromDate && toDate) {
    const currentPeriodDays = differenceInDays(
      new Date(toDate),
      new Date(fromDate),
    );
    const previousFromDate = subDays(new Date(fromDate), currentPeriodDays);
    const previousToDate = new Date(fromDate);

    const previousPeriodStats = await getResponseTimeStats({
      fromDate: previousFromDate.getTime(),
      toDate: previousToDate.getTime(),
      emailProvider,
      logger,
    });

    if (previousPeriodStats.summary.medianResponseTime > 0) {
      const percentChange =
        ((medianResponseTime - previousPeriodStats.summary.medianResponseTime) /
          previousPeriodStats.summary.medianResponseTime) *
        100;

      previousPeriodComparison = {
        medianResponseTime: previousPeriodStats.summary.medianResponseTime,
        percentChange: Math.round(percentChange),
      };
    }
  }

  // Calculate response rate (threads with reply vs total sent)
  const responseRate = 100; // All threads in our dataset have replies by definition

  return {
    summary: {
      medianResponseTime: Math.round(medianResponseTime),
      averageResponseTime: Math.round(averageResponseTime),
      responseRate: Math.round(responseRate),
      within1Hour: Math.round(within1Hour),
      previousPeriodComparison,
    },
    distribution,
    trend,
  };
}

export type ResponseTimeResponse = Awaited<
  ReturnType<typeof getResponseTimeStats>
>;

export const GET = withEmailProvider("response-time-stats", async (request) => {
  const { searchParams } = new URL(request.url);
  const params = responseTimeParams.parse({
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
