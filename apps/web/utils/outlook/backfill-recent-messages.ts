import { processHistoryForUser } from "@/app/api/outlook/webhook/process-history";
import { createEmailProvider } from "@/utils/email/provider";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import type { ParsedMessage } from "@/utils/types";

const OUTLOOK_RECONCILE_PAGE_SIZE = 50;

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

  logger.info("Reconciling recent Outlook messages", {
    after,
    maxMessages,
    pageCount,
    candidateCount: candidateMessages.length,
    unseenCount: unseenMessages.length,
    subscriptionId,
  });

  let processedCount = 0;
  for (const message of unseenMessages) {
    try {
      await processHistoryForUser({
        emailAddress,
        subscriptionId,
        resourceData: {
          id: message.id,
          conversationId: message.threadId,
        },
        logger: logger.with({ messageId: message.id }),
      });
      processedCount++;
    } catch (error) {
      logger.error("Failed to process message during backfill", {
        messageId: message.id,
        error,
      });
    }
  }

  logger.info("Finished reconciling recent Outlook messages", {
    after,
    maxMessages,
    pageCount,
    candidateCount: candidateMessages.length,
    unseenCount: unseenMessages.length,
    processedCount,
    subscriptionId,
  });

  return {
    processedCount,
    candidateCount: candidateMessages.length,
  };
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
