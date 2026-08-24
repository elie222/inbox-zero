import type { EmailProvider } from "@/utils/email/types";
import { isIgnoredSender } from "@/utils/filter-ignored-senders";
import { isDefined } from "@/utils/types";
import prisma from "@/utils/prisma";
import type { ThreadsQuery } from "@/utils/threads/validation";

export async function loadThreads({
  query,
  emailAccountId,
  emailProvider,
  messageFormat,
}: {
  query: ThreadsQuery;
  emailAccountId: string;
  emailProvider: EmailProvider;
  messageFormat: "full" | "metadata";
}) {
  const { threads, nextPageToken } = await emailProvider.getThreadsWithQuery({
    query,
    maxResults: query.limit || 50,
    pageToken: query.nextPageToken || undefined,
    messageFormat,
  });

  const threadIds = threads.map((thread) => thread.id);
  const executedRules = await prisma.executedRule.findMany({
    where: {
      emailAccountId,
      threadId: { in: threadIds },
    },
    select: {
      id: true,
      messageId: true,
      threadId: true,
      rule: true,
      actionItems: {
        include: {
          messagingChannel: {
            select: {
              provider: true,
            },
          },
        },
      },
      status: true,
      reason: true,
      createdAt: true,
    },
    // The aggregation below keeps the first execution of each rule.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  const executedRulesByThreadId = new Map<
    string,
    (typeof executedRules)[number][]
  >();
  for (const executedRule of executedRules) {
    if (!executedRule.threadId) continue;
    const threadExecutions =
      executedRulesByThreadId.get(executedRule.threadId) ?? [];
    threadExecutions.push(executedRule);
    executedRulesByThreadId.set(executedRule.threadId, threadExecutions);
  }

  const threadsWithPlans = threads.map((thread) => {
    const plans = aggregateThreadPlans(
      executedRulesByThreadId.get(thread.id) ?? [],
    );
    const messageIds = thread.messages.map((message) => message.id);
    const messages = thread.messages.filter((message) => {
      if (!message.headers?.from) return true;
      return !isIgnoredSender(message.headers.from);
    });
    if (!messages.length) return;

    return {
      id: thread.id,
      messageIds,
      messages,
      snippet: thread.snippet,
      plan: plans.at(0),
      plans,
    };
  });

  return {
    threads: threadsWithPlans.filter(isDefined),
    nextPageToken,
  };
}

export type LoadedThreads = Awaited<ReturnType<typeof loadThreads>>;

export function toListThreads({ threads, nextPageToken }: LoadedThreads) {
  return {
    threads: threads.map((thread) => ({
      id: thread.id,
      messageIds: thread.messageIds,
      snippet: thread.snippet,
      plan: thread.plan,
      plans: thread.plans,
      messages: thread.messages.map((message) => ({
        id: message.id,
        threadId: message.threadId,
        snippet: message.snippet,
        subject: message.subject,
        date: message.date,
        internalDate: message.internalDate,
        labelIds: message.labelIds,
        headers: message.headers,
      })),
    })),
    nextPageToken,
  };
}

type LoadedThreadListItem = ReturnType<typeof toListThreads>["threads"][number];

export type ThreadListItem = Omit<LoadedThreadListItem, "messageIds"> & {
  messageIds?: string[];
};

function aggregateThreadPlans<
  T extends { id: string; createdAt: Date; rule: { id: string } | null },
>(executedRules: T[]): Omit<T, "createdAt">[] {
  const latestByRule = new Map<string, Omit<T, "createdAt">>();

  for (const executedRule of executedRules) {
    const key = executedRule.rule?.id ?? executedRule.id;
    if (latestByRule.has(key)) continue;
    const { createdAt: _createdAt, ...plan } = executedRule;
    latestByRule.set(key, plan);
  }

  return [...latestByRule.values()];
}
