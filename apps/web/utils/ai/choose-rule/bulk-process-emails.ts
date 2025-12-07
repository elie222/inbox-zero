import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { runRules } from "@/utils/ai/choose-rule/run-rules";
import type { Logger } from "@/utils/logger";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { ParsedMessage } from "@/utils/types";

export async function bulkProcessInboxEmails({
  emailAccount,
  provider,
  maxEmails,
  skipArchive,
  logger: log,
}: {
  emailAccount: EmailAccountWithAI;
  provider: string;
  maxEmails: number;
  skipArchive: boolean;
  logger: Logger;
}) {
  const logger = log.with({ module: "bulk-process-emails" });

  logger.info("Starting bulk inbox email processing");

  try {
    const emailProvider = await createEmailProvider({
      emailAccountId: emailAccount.id,
      provider,
      logger,
    });

    const [{ messages }, rules] = await Promise.all([
      emailProvider.getMessagesByFields({
        type: "inbox",
        maxResults: maxEmails,
      }),
      prisma.rule.findMany({
        where: {
          emailAccountId: emailAccount.id,
          enabled: true,
        },
        include: { actions: true },
      }),
    ]);

    if (messages.length === 0) {
      logger.info("No inbox emails to process");
      return;
    }

    if (rules.length === 0) {
      logger.info("No rules found");
      return;
    }

    const uniqueMessages = getLatestMessagePerThread(messages);

    logger.info("Processing emails with rules", {
      ruleCount: rules.length,
      emailCount: uniqueMessages.length,
      totalFetched: messages.length,
    });

    let processedCount = 0;
    let errorCount = 0;

    for (const message of uniqueMessages) {
      try {
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
        processedCount++;
      } catch (error) {
        errorCount++;
        logger.error("Error processing email", {
          messageId: message.id,
          error,
        });
        // Continue processing other emails even if one fails
      }
    }

    logger.info("Completed bulk email processing", {
      processedCount,
      errorCount,
      totalEmails: uniqueMessages.length,
    });
  } catch (error) {
    logger.error("Failed to process emails", { error });
  }
}

function getLatestMessagePerThread(messages: ParsedMessage[]): ParsedMessage[] {
  const latestByThread = new Map<string, ParsedMessage>();

  for (const message of messages) {
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
