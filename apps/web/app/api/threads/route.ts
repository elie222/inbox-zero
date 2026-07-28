import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { type ThreadsQuery, threadsQuery } from "@/utils/threads/validation";
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
    const nextPageToken = searchParams.get("nextPageToken");
    const q = searchParams.get("q");
    const labelId = searchParams.get("labelId");
    const after = searchParams.get("after");
    const before = searchParams.get("before");
    const isUnread = searchParams.get("isUnread");

    const query = threadsQuery.parse({
      limit,
      fromEmail,
      type,
      nextPageToken,
      q,
      labelId,
      after,
      before,
      isUnread,
    });

    try {
      const threads = await getThreads({
        query,
        emailAccountId,
        emailProvider,
      });
      return NextResponse.json(threads);
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

async function getThreads({
  query,
  emailAccountId,
  emailProvider,
}: {
  query: ThreadsQuery;
  emailAccountId: string;
  emailProvider: EmailProvider;
}) {
  // List rows only need headers/snippet/labels; bodies are fetched on open
  // via /api/threads/[id]. Metadata format cuts the Gmail payload ~10-50x.
  const { threads, nextPageToken } = await emailProvider.getThreadsWithQuery({
    query,
    maxResults: query.limit || 50,
    pageToken: query.nextPageToken || undefined,
    format: "metadata",
  });

  const threadIds = threads.map((t) => t.id);
  const plans = await prisma.executedRule.findMany({
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
    },
    // The badge shows the CURRENT decision: newest first, and a decision
    // from a since-disabled rule is history, not the answer
    orderBy: { createdAt: "desc" },
    // Reprocessing appends a row per run, so a thread can accumulate many
    // executions; the newest-per-thread is all the badge needs. Cap the
    // payload so a heavily-reprocessed page can't pull thousands of rows.
    take: (query.limit || 50) * 3,
  });

  // Process threads with plans and categories
  const threadsWithPlans = await Promise.all(
    threads.map(async (thread) => {
      const plan = plans.find(
        (p) => p.threadId === thread.id && p.rule?.enabled !== false,
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
        plan,
      };
    }),
  );

  return {
    threads: threadsWithPlans.filter(isDefined),
    nextPageToken,
  };
}
