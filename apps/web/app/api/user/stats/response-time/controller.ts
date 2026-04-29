import type { EmailProvider, SentMessagePage } from "@/utils/email/types";
import { format } from "date-fns/format";
import { startOfWeek } from "date-fns/startOfWeek";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { sleep } from "@/utils/sleep";
import {
  calculateResponseTimes,
  calculateSummaryStats,
  calculateDistribution,
  calculateMedian,
  type ResponseTimeEntry,
  type SummaryStats,
  type DistributionStats,
} from "./calculate";
import type { ResponseTimeQuery } from "@/app/api/user/stats/response-time/validation";

const DEFAULT_MAX_SENT_MESSAGES = 50;
const SENT_MESSAGES_PAGE_SIZE = 50;
const ADMIN_PROVIDER_REQUEST_DELAY_MS = 250;

type SentMessage = SentMessagePage["messages"][number];

interface TrendEntry {
  count: number;
  medianResponseTime: number;
  period: string;
  periodDate: Date;
}

export type ResponseTimeResponse = {
  summary: SummaryStats;
  distribution: DistributionStats;
  trend: TrendEntry[];
  emailsAnalyzed: number;
  maxEmailsCap: number;
};

export async function getResponseTimeStats({
  fromDate,
  toDate,
  emailAccountId,
  emailProvider,
  logger,
  maxSentMessages = DEFAULT_MAX_SENT_MESSAGES,
  providerRequestDelayMs = 0,
}: ResponseTimeQuery & {
  emailAccountId: string;
  emailProvider: EmailProvider;
  logger: Logger;
  maxSentMessages?: number;
  providerRequestDelayMs?: number;
}): Promise<ResponseTimeResponse> {
  // 1. Fetch sent message IDs (lightweight - just id and threadId)
  const sentMessages = await getSentMessagesForResponseTimes({
    emailProvider,
    maxSentMessages,
    providerRequestDelayMs,
    ...(fromDate ? { after: new Date(fromDate) } : {}),
    ...(toDate ? { before: new Date(toDate) } : {}),
  });

  if (!sentMessages.length) {
    return getEmptyStats(maxSentMessages);
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
      responseTimeMins: true,
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
      { providerRequestDelayMs },
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
          responseTimeMins: rt.responseTimeMins,
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
    return getEmptyStats(maxSentMessages);
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
    maxEmailsCap: maxSentMessages,
  };
}

async function getSentMessagesForResponseTimes({
  emailProvider,
  maxSentMessages,
  after,
  before,
  providerRequestDelayMs,
}: {
  emailProvider: EmailProvider;
  maxSentMessages: number;
  after?: Date;
  before?: Date;
  providerRequestDelayMs: number;
}): Promise<SentMessage[]> {
  const sentMessages: SentMessage[] = [];
  let pageToken: string | undefined;
  let providerRequests = 0;

  do {
    const remaining = maxSentMessages - sentMessages.length;
    if (remaining <= 0) break;

    if (providerRequests > 0 && providerRequestDelayMs) {
      await sleep(providerRequestDelayMs);
    }
    providerRequests++;

    const page = await emailProvider.getSentMessageIds({
      maxResults: Math.min(remaining, SENT_MESSAGES_PAGE_SIZE),
      after,
      before,
      pageToken,
    });

    if (page.messages.length === 0) break;

    sentMessages.push(...page.messages);
    pageToken = page.nextPageToken;
  } while (pageToken && sentMessages.length < maxSentMessages);

  return sentMessages.slice(0, maxSentMessages);
}

function calculateTrend(responseTimes: ResponseTimeEntry[]): TrendEntry[] {
  const trendMap = new Map<string, { values: number[]; date: Date }>();

  for (const rt of responseTimes) {
    const weekStart = startOfWeek(rt.sentAt);
    const key = format(weekStart, "yyyy-MM-dd");

    if (!trendMap.has(key)) {
      trendMap.set(key, { values: [], date: weekStart });
    }
    trendMap.get(key)!.values.push(rt.responseTimeMins);
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

function getEmptyStats(maxSentMessages: number): ResponseTimeResponse {
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
    maxEmailsCap: maxSentMessages,
  };
}

export function getAdminResponseTimeProviderDelayMs() {
  return ADMIN_PROVIDER_REQUEST_DELAY_MS;
}
