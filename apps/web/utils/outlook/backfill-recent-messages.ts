import { processHistoryForUser } from "@/utils/webhook/outlook/process-history";
import { createEmailProvider } from "@/utils/email/provider";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import type { ParsedMessage } from "@/utils/types";
import { runWithBoundedConcurrency } from "@/utils/async";

const OUTLOOK_RECONCILE_PAGE_SIZE = 50;
const OUTLOOK_RECONCILE_MESSAGE_CONCURRENCY = 5;

export async function backfillRecentOutlookMessages({
  emailAccountId,
  emailAddress,
  subscriptionId,
  after,
  maxMessages,
  logger,
}: {
  emailAccountId: string;
  emailAddress: string;
  subscriptionId?: string;
  after: Date;
  maxMessages: number;
  logger: Logger;
}) {
  const provider = await createEmailProvider({
    emailAccountId,
    provider: "microsoft",
    logger,
  });

  const { messages: candidateMessages, pageCount } = await listRecentMessages({
    provider,
    after,
    maxMessages,
  });

  if (!candidateMessages.length) {
    logger.info("No recent Outlook messages found for reconciliation", {
      after,
      maxMessages,
      pageCount,
    });
    return { processedCount: 0, candidateCount: 0 };
  }

  const existingMessages = await prisma.emailMessage.findMany({
    where: {
      emailAccountId,
      messageId: { in: candidateMessages.map((message) => message.id) },
    },
    select: { messageId: true },
  });
  const existingMessageIds = new Set(
    existingMessages.map((message) => message.messageId),
  );

  const unseenMessages = candidateMessages
    .filter((message) => !existingMessageIds.has(message.id))
    .sort(
      (left, right) =>
        new Date(left.date).getTime() - new Date(right.date).getTime(),
    );
  const unseenThreads = getOldestMessagePerThread(unseenMessages);

  logger.info("Reconciling recent Outlook messages", {
    after,
    maxMessages,
    pageCount,
    candidateCount: candidateMessages.length,
    unseenCount: unseenMessages.length,
    unseenThreadCount: unseenThreads.length,
    subscriptionId,
  });

  const results = await runWithBoundedConcurrency({
    items: unseenThreads,
    concurrency: OUTLOOK_RECONCILE_MESSAGE_CONCURRENCY,
    run: (message) =>
      processHistoryForUser({
        emailAddress,
        subscriptionId,
        resourceData: {
          id: message.id,
          conversationId: message.threadId,
        },
        logger: logger.with({ messageId: message.id }),
      }),
  });

  let processedCount = 0;
  for (const { item: message, result } of results) {
    if (result.status === "fulfilled") {
      processedCount++;
      continue;
    }

    logger.error("Failed to process message during backfill", {
      messageId: message.id,
      error: result.reason,
    });
  }

  logger.info("Finished reconciling recent Outlook messages", {
    after,
    maxMessages,
    pageCount,
    candidateCount: candidateMessages.length,
    unseenCount: unseenMessages.length,
    unseenThreadCount: unseenThreads.length,
    processedCount,
    subscriptionId,
  });

  return {
    processedCount,
    candidateCount: candidateMessages.length,
  };
}

function getOldestMessagePerThread(messages: ParsedMessage[]) {
  const messagesByThread = new Map<string, ParsedMessage>();

  for (const message of messages) {
    const existing = messagesByThread.get(message.threadId);
    if (!existing) {
      messagesByThread.set(message.threadId, message);
      continue;
    }

    if (new Date(message.date).getTime() < new Date(existing.date).getTime()) {
      messagesByThread.set(message.threadId, message);
    }
  }

  return [...messagesByThread.values()].sort(
    (left, right) =>
      new Date(left.date).getTime() - new Date(right.date).getTime(),
  );
}

async function listRecentMessages({
  provider,
  after,
  maxMessages,
}: {
  provider: EmailProvider;
  after: Date;
  maxMessages: number;
}) {
  const messages: ParsedMessage[] = [];
  const seenMessageIds = new Set<string>();
  let pageToken: string | undefined;
  let pageCount = 0;

  while (messages.length < maxMessages) {
    const response = await provider.getMessagesWithPagination({
      after,
      maxResults: Math.min(
        OUTLOOK_RECONCILE_PAGE_SIZE,
        maxMessages - messages.length,
      ),
      pageToken,
    });
    pageCount++;

    for (const message of response.messages) {
      if (seenMessageIds.has(message.id)) continue;
      seenMessageIds.add(message.id);
      messages.push(message);
    }

    if (!response.nextPageToken || !response.messages.length) break;
    pageToken = response.nextPageToken;
  }

  return { messages, pageCount };
}
