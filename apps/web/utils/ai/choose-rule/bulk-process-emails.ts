import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { runRules } from "@/utils/ai/choose-rule/run-rules";
import type { Logger } from "@/utils/logger";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { ParsedMessage } from "@/utils/types";
import type { Rule, Action } from "@prisma/client";
import { analyzeAndSetExpiration } from "@/utils/expiration/analyze-expiration";

// Parallel processing concurrency - adjust based on your LLM endpoint capacity
// Azure AI Foundry typically handles 5-10 concurrent requests well
const DEFAULT_CONCURRENCY = 5;

// Page size for fetching emails - balances API calls vs memory
const PAGE_SIZE = 100;

export async function bulkProcessInboxEmails({
  emailAccount,
  provider,
  maxEmails,
  skipArchive,
  logger: log,
  concurrency = DEFAULT_CONCURRENCY,
  after,
  before,
  skipAlreadyProcessed = true,
  processOldestFirst = true,
}: {
  emailAccount: EmailAccountWithAI;
  provider: string;
  maxEmails?: number;
  skipArchive: boolean;
  logger: Logger;
  concurrency?: number;
  after?: Date;
  before?: Date;
  skipAlreadyProcessed?: boolean;
  processOldestFirst?: boolean;
}) {
  const logger = log.with({ module: "bulk-process-emails" });

  logger.info("Starting bulk inbox email processing (streaming mode)", {
    concurrency,
    maxEmails: maxEmails || "unlimited",
    pageSize: PAGE_SIZE,
    after: after?.toISOString(),
    before: before?.toISOString(),
    skipAlreadyProcessed,
    processOldestFirst,
  });

  try {
    const emailProvider = await createEmailProvider({
      emailAccountId: emailAccount.id,
      provider,
      logger,
    });

    // Fetch rules once upfront
    const rules = await prisma.rule.findMany({
      where: {
        emailAccountId: emailAccount.id,
        enabled: true,
      },
      include: { actions: true },
    });

    if (rules.length === 0) {
      logger.info("No rules found");
      return;
    }

    logger.info("Rules loaded", { ruleCount: rules.length });

    // Build Gmail query
    let query = "in:inbox";
    if (after) {
      query += ` after:${Math.floor(after.getTime() / 1000) - 1}`;
    }
    if (before) {
      query += ` before:${Math.floor(before.getTime() / 1000) + 1}`;
    }

    let processedCount = 0;
    let errorCount = 0;
    let totalFetched = 0;
    let pageNum = 0;
    let nextPageToken: string | undefined;
    const processedThreadIds = new Set<string>();

    // Stream pages of emails and process each page immediately
    do {
      pageNum++;
      logger.info(`Fetching page ${pageNum}...`, {
        pageToken: nextPageToken ? "has token" : "first page",
      });

      const { messages, nextPageToken: newToken } =
        await emailProvider.getMessagesWithPagination({
          query,
          maxResults: PAGE_SIZE,
          pageToken: nextPageToken,
          after,
          before,
        });

      nextPageToken = newToken;
      totalFetched += messages.length;

      if (messages.length === 0) {
        logger.info("No more messages to process");
        break;
      }

      // Get unique messages per thread (only process latest message in each thread)
      let uniqueMessages = getLatestMessagePerThread(
        messages,
        processedThreadIds,
      );

      // Track processed thread IDs to avoid duplicates across pages
      for (const msg of uniqueMessages) {
        processedThreadIds.add(msg.threadId);
      }

      // Filter out messages that have already been processed (have ExecutedRule records)
      let skippedCount = 0;
      if (skipAlreadyProcessed && uniqueMessages.length > 0) {
        const messageIds = uniqueMessages.map((m) => m.id);
        const alreadyProcessed = await prisma.executedRule.findMany({
          where: {
            emailAccountId: emailAccount.id,
            messageId: { in: messageIds },
          },
          select: { messageId: true },
        });
        const alreadyProcessedIds = new Set(
          alreadyProcessed.map((r) => r.messageId),
        );
        const beforeCount = uniqueMessages.length;
        uniqueMessages = uniqueMessages.filter(
          (m) => !alreadyProcessedIds.has(m.id),
        );
        skippedCount = beforeCount - uniqueMessages.length;
      }

      // Sort messages by date: oldest first if processOldestFirst is true
      if (processOldestFirst && uniqueMessages.length > 0) {
        uniqueMessages.sort((a, b) => {
          const dateA = new Date(a.date || 0).getTime();
          const dateB = new Date(b.date || 0).getTime();
          return dateA - dateB; // Ascending = oldest first
        });
      }

      logger.info(`Processing page ${pageNum}`, {
        pageMessages: messages.length,
        uniqueInPage: uniqueMessages.length + skippedCount,
        skippedAlreadyProcessed: skippedCount,
        toProcess: uniqueMessages.length,
        totalFetched,
        totalProcessed: processedCount,
        hasMorePages: !!nextPageToken,
      });

      // Skip if all messages in this page were already processed
      if (uniqueMessages.length === 0) {
        continue;
      }

      // Process this page's messages in parallel batches
      const { processed, errors } = await processMessageBatch({
        messages: uniqueMessages,
        rules,
        emailProvider,
        emailAccount,
        skipArchive,
        concurrency,
        logger,
      });

      processedCount += processed;
      errorCount += errors;

      // Check if we've hit the max emails limit
      if (maxEmails && processedCount >= maxEmails) {
        logger.info("Reached max emails limit", { maxEmails, processedCount });
        break;
      }
    } while (nextPageToken);

    logger.info("Completed bulk email processing", {
      processedCount,
      errorCount,
      totalFetched,
      uniqueThreads: processedThreadIds.size,
      pages: pageNum,
    });
  } catch (error) {
    logger.error("Failed to process emails", { error });
  }
}

async function processMessageBatch({
  messages,
  rules,
  emailProvider,
  emailAccount,
  skipArchive,
  concurrency,
  logger,
}: {
  messages: ParsedMessage[];
  rules: (Rule & { actions: Action[] })[];
  emailProvider: Awaited<
    ReturnType<typeof import("@/utils/email/provider").createEmailProvider>
  >;
  emailAccount: EmailAccountWithAI;
  skipArchive: boolean;
  concurrency: number;
  logger: Logger;
}): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  // Process in batches of concurrency
  for (let i = 0; i < messages.length; i += concurrency) {
    const batch = messages.slice(i, i + concurrency);

    const results = await Promise.allSettled(
      batch.map(async (message) => {
        // Run rules first
        await runRules({
          provider: emailProvider,
          message,
          rules,
          emailAccount,
          isTest: false,
          modelType: "economy",
          logger,
          skipArchive,
        });

        // Then analyze expiration (reuses already-fetched message, graceful on error)
        await analyzeAndSetExpiration({
          emailAccount,
          message,
          logger,
        }).catch((error) => {
          logger.warn("Failed to analyze expiration", {
            messageId: message.id,
            error,
          });
          // Don't fail the whole batch for expiration errors
        });
      }),
    );

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        processed++;
      } else {
        errors++;
        logger.error("Error processing email", {
          messageId: batch[index].id,
          error: result.reason,
        });
      }
    });
  }

  return { processed, errors };
}

function getLatestMessagePerThread(
  messages: ParsedMessage[],
  alreadyProcessedThreadIds?: Set<string>,
): ParsedMessage[] {
  const latestByThread = new Map<string, ParsedMessage>();

  for (const message of messages) {
    // Skip threads we've already processed in previous pages
    if (alreadyProcessedThreadIds?.has(message.threadId)) {
      continue;
    }

    const existing = latestByThread.get(message.threadId);
    if (
      !existing ||
      new Date(message.date || 0) > new Date(existing.date || 0)
    ) {
      latestByThread.set(message.threadId, message);
    }
  }

  return Array.from(latestByThread.values());
}
