import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import {
  type ThreadsQuery,
  threadsQuery,
  threadsView,
} from "@/utils/threads/validation";
import { isDefined } from "@/utils/types";
import prisma from "@/utils/prisma";
import { isIgnoredSender } from "@/utils/filter-ignored-senders";
import type { EmailProvider } from "@/utils/email/types";

export const maxDuration = 30;

export const GET = withEmailProvider(
  "threads",
  async (request) => {
    const { emailProvider } = request;
    const { emailAccountId } = request.auth;

    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit");
    const fromEmail = searchParams.get("fromEmail");
    const type = searchParams.get("type");
    const folderId = searchParams.get("folderId");
    const inboxSection = searchParams.get("inboxSection");
    const nextPageToken = searchParams.get("nextPageToken");
    const q = searchParams.get("q");
    const labelId = searchParams.get("labelId");
    const labelIds = searchParams
      .getAll("labelIds")
      .flatMap((value) => value.split(","))
      .map((labelId) => labelId.trim())
      .filter(Boolean);
    const after = searchParams.get("after");
    const before = searchParams.get("before");
    const isUnread = searchParams.get("isUnread");
    const view = threadsView.parse(searchParams.get("view"));

    const query = threadsQuery.parse({
      limit,
      fromEmail,
      type,
      folderId,
      inboxSection,
      nextPageToken,
      q,
      labelId,
      labelIds: labelIds.length ? labelIds : undefined,
      after,
      before,
      isUnread,
    });

    try {
      const threads = await getThreads({
        query,
        emailAccountId,
        emailProvider,
        messageFormat: view === "list" ? "metadata" : "full",
      });
      return NextResponse.json(
        view === "list" ? toListThreads(threads) : threads,
      );
    } catch (error) {
      request.logger.error("Error fetching threads", {
        error,
        emailAccountId,
      });
      return NextResponse.json(
        { error: "Failed to fetch threads" },
        { status: 500 },
      );
    }
  },
  { requestTiming: {} },
);

export type ThreadsResponse = Awaited<ReturnType<typeof getThreads>>;

/** Slim rows for the mail list: `?view=list`. No message bodies or attachments. */
export type ThreadsListResponse = ReturnType<typeof toListThreads>;

async function getThreads({
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
  // Get threads using the provider
  const { threads, nextPageToken } = await emailProvider.getThreadsWithQuery({
    query,
    maxResults: query.limit || 50,
    pageToken: query.nextPageToken || undefined,
    messageFormat,
  });

  const threadIds = threads.map((t) => t.id);
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
    // Newest first so the per-rule aggregation below keeps the latest execution
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

  // Process threads with plans and categories
  const threadsWithPlans = threads.map((thread) => {
    const plans = aggregateThreadPlans(
      executedRulesByThreadId.get(thread.id) ?? [],
    );

    // Filter out ignored senders from the already parsed messages
    const filteredMessages = thread.messages.filter((message) => {
      if (!message.headers?.from) return true; // Keep messages without from field
      return !isIgnoredSender(message.headers.from);
    });

    return {
      id: thread.id,
      messages: filteredMessages,
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

// `ExecutedRule` is per message, so a thread can hold several rows for the same
// rule. Keep the most recent execution of each rule, newest first. Rows whose
// rule was deleted collapse into a single entry.
function aggregateThreadPlans<
  T extends { createdAt: Date; rule: { id: string } | null },
>(executedRules: T[]): Omit<T, "createdAt">[] {
  const latestByRule = new Map<string, Omit<T, "createdAt">>();

  for (const executedRule of executedRules) {
    const key = executedRule.rule?.id ?? "deleted-rule";
    if (latestByRule.has(key)) continue;
    const { createdAt: _createdAt, ...plan } = executedRule;
    latestByRule.set(key, plan);
  }

  return [...latestByRule.values()];
}

function toListThreads({ threads, nextPageToken }: ThreadsResponse) {
  return {
    threads: threads.map((thread) => ({
      id: thread.id,
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
