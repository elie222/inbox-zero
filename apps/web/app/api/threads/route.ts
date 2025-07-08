import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { threadsQuery } from "@/app/api/threads/validation";
import { createEmailProvider } from "@/utils/email/provider";
import { isDefined } from "@/utils/types";
import prisma from "@/utils/prisma";
import { getCategory } from "@/utils/redis/category";
import { ExecutedRuleStatus } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";
import { isIgnoredSender } from "@/utils/filter-ignored-senders";

const logger = createScopedLogger("api/threads");

export type ThreadsResponse = Awaited<ReturnType<typeof getThreads>>;

async function getThreads({
  query,
  emailAccountId,
  userEmail,
}: {
  query: any;
  emailAccountId: string;
  userEmail: string;
}) {
  // Get the email account to determine the provider
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      account: {
        select: {
          provider: true,
        },
      },
    },
  });

  if (!emailAccount) {
    throw new Error("Email account not found");
  }

  const provider = emailAccount.account.provider;
  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
  });

  // Get threads using the provider
  const { threads, nextPageToken } = await emailProvider.getThreadsWithQuery({
    query,
    maxResults: query.limit || 50,
    pageToken: query.nextPageToken,
  });

  // Get executed rules for these threads
  const threadIds = threads.map((t) => t.id);
  const plans = await prisma.executedRule.findMany({
    where: {
      emailAccountId,
      threadId: { in: threadIds },
      status: {
        in: [ExecutedRuleStatus.PENDING, ExecutedRuleStatus.SKIPPED],
      },
    },
    select: {
      id: true,
      messageId: true,
      threadId: true,
      rule: true,
      actionItems: true,
      status: true,
      reason: true,
    },
  });

  // Process threads with plans and categories
  const threadsWithPlans = await Promise.all(
    threads.map(async (thread) => {
      const plan = plans.find((p) => p.threadId === thread.id);

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
        category: await getCategory({ emailAccountId, threadId: thread.id }),
      };
    }),
  );

  return {
    threads: threadsWithPlans.filter(isDefined),
    nextPageToken,
  };
}

export const dynamic = "force-dynamic";

export const maxDuration = 30;

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const userEmail = request.auth.email;

  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit");
  const fromEmail = searchParams.get("fromEmail");
  const type = searchParams.get("type");
  const nextPageToken = searchParams.get("nextPageToken");
  const q = searchParams.get("q");
  const labelId = searchParams.get("labelId");
  const folderId = searchParams.get("folderId");

  const query = threadsQuery.parse({
    limit,
    fromEmail,
    type,
    nextPageToken,
    q,
    labelId,
    folderId,
  });

  try {
    const threads = await getThreads({
      query,
      emailAccountId,
      userEmail,
    });
    return NextResponse.json(threads);
  } catch (error) {
    logger.error("Error fetching threads", { error, emailAccountId });
    return NextResponse.json(
      { error: "Failed to fetch threads" },
      { status: 500 },
    );
  }
});
