import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import type { ResponseTime } from "@/generated/prisma/client";

export type ResponseTimeEntry = Pick<
  ResponseTime,
  | "threadId"
  | "sentMessageId"
  | "receivedMessageId"
  | "receivedAt"
  | "sentAt"
  | "responseTimeMins"
>;

export interface SummaryStats {
  medianResponseTime: number;
  averageResponseTime: number;
  within1Hour: number;
  previousPeriodComparison: {
    medianResponseTime: number;
    percentChange: number;
  } | null;
}

export interface DistributionStats {
  lessThan1Hour: number;
  oneToFourHours: number;
  fourTo24Hours: number;
  oneToThreeDays: number;
  threeToSevenDays: number;
  moreThan7Days: number;
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

export async function calculateResponseTimes(
  sentMessages: { id: string; threadId: string }[],
  emailProvider: EmailProvider,
  logger: Logger,
): Promise<{
  responseTimes: ResponseTimeEntry[];
  processedThreadsCount: number;
}> {
  const responseTimes: ResponseTimeEntry[] = [];
  const processedThreads = new Set<string>();
  const sentMessageIds = new Set(sentMessages.map((m) => m.id));

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

        // Check SENT label first, fallback to checking if message ID is in sent messages list
        const isSent =
          emailProvider.isSentMessage(message) ||
          sentMessageIds.has(message.id);

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
                responseTimeMins: Math.floor(diff / (1000 * 60)),
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

export function calculateSummaryStats(
  responseTimes: ResponseTimeEntry[],
): SummaryStats {
  const values = responseTimes.map((r) => r.responseTimeMins);

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
  const values = responseTimes.map((r) => r.responseTimeMins);

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

export { calculateMedian };
