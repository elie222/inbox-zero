import prisma from "@/utils/prisma";
import { runRules } from "@/utils/ai/choose-rule/run-rules";
import { categorizeSender } from "@/utils/categorize/senders/categorize";
import { isAssistantEmail } from "@/utils/assistant/is-assistant-email";
import { processAssistantEmail } from "@/utils/assistant/process-assistant-email";
import { handleOutboundMessage } from "@/utils/reply-tracker/handle-outbound";
import { NewsletterStatus } from "@/generated/prisma/enums";
import type { EmailAccount } from "@/generated/prisma/client";
import { extractEmailAddress } from "@/utils/email";
import { isIgnoredSender } from "@/utils/filter-ignored-senders";
import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage, RuleWithActions } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";

export type SharedProcessHistoryOptions = {
  provider: EmailProvider;
  rules: RuleWithActions[];
  hasAutomationRules: boolean;
  hasAiAccess: boolean;
  emailAccount: EmailAccountWithAI &
    Pick<EmailAccount, "autoCategorizeSenders">;
  logger: Logger;
};

export async function processHistoryItem(
  {
    messageId,
    threadId,
    message,
  }: {
    messageId: string;
    threadId?: string;
    message?: ParsedMessage;
  },
  options: SharedProcessHistoryOptions,
) {
  const {
    provider,
    emailAccount,
    hasAutomationRules,
    hasAiAccess,
    rules,
    logger,
  } = options;

  const emailAccountId = emailAccount.id;
  const userEmail = emailAccount.email;

  try {
    // Use pre-fetched message if provided, otherwise fetch it
    const parsedMessage = message ?? (await provider.getMessage(messageId));

    if (isIgnoredSender(parsedMessage.headers.from)) {
      logger.info("Skipping. Ignored sender.");
      return;
    }

    // Get threadId from message if not provided
    const actualThreadId = threadId || parsedMessage.threadId;

    const hasExistingRule = actualThreadId
      ? await prisma.executedRule.findFirst({
          where: {
            emailAccountId,
            threadId: actualThreadId,
            messageId,
          },
          select: { id: true },
        })
      : null;

    if (hasExistingRule) {
      logger.info("Skipping. Rule already exists.");
      return;
    }

    const isForAssistant = isAssistantEmail({
      userEmail,
      emailToCheck: parsedMessage.headers.to,
    });

    if (isForAssistant) {
      logger.info("Passing through assistant email.");
      return processAssistantEmail({
        message: parsedMessage,
        emailAccountId,
        userEmail,
        provider,
        logger,
      });
    }

    const isFromAssistant = isAssistantEmail({
      userEmail,
      emailToCheck: parsedMessage.headers.from,
    });

    if (isFromAssistant) {
      logger.info("Skipping. Assistant email.");
      return;
    }

    const isOutbound = provider.isSentMessage(parsedMessage);

    if (isOutbound) {
      await handleOutboundMessage({
        emailAccount,
        message: parsedMessage,
        provider,
        logger,
      });
      return;
    }

    // check if unsubscribed
    const email = extractEmailAddress(parsedMessage.headers.from);
    const sender = await prisma.newsletter.findFirst({
      where: {
        emailAccountId,
        email,
        status: NewsletterStatus.UNSUBSCRIBED,
      },
    });

    if (sender) {
      await provider.blockUnsubscribedEmail(messageId);
      logger.info("Skipping. Blocked unsubscribed email.", { from: email });
      return;
    }

    if (!hasAiAccess) {
      logger.info("Skipping. No AI access.");
      return;
    }

    // categorize a sender if we haven't already
    // this is used for category filters in ai rules
    if (emailAccount.autoCategorizeSenders) {
      const sender = extractEmailAddress(parsedMessage.headers.from);
      const existingSender = await prisma.newsletter.findUnique({
        where: {
          email_emailAccountId: { email: sender, emailAccountId },
        },
        select: { category: true },
      });
      if (!existingSender?.category) {
        await categorizeSender(sender, emailAccount, provider);
      }
    }

    if (hasAutomationRules && hasAiAccess) {
      logger.info("Running rules...");

      await runRules({
        provider,
        message: parsedMessage,
        rules,
        emailAccount,
        isTest: false,
        modelType: "default",
        logger,
      });
    }
  } catch (error: unknown) {
    // Handle provider-specific "not found" errors
    if (error instanceof Error) {
      const isGoogleNotFound =
        error.message === "Requested entity was not found.";

      // Outlook can return ErrorItemNotFound code or "not found in the store" message
      const err = error as { code?: string };
      const isOutlookNotFound =
        err?.code === "ErrorItemNotFound" ||
        err?.code === "itemNotFound" ||
        error.message.includes("ItemNotFound") ||
        error.message.includes("not found in the store") ||
        error.message.includes("ResourceNotFound");

      if (isGoogleNotFound || isOutlookNotFound) {
        logger.info("Message not found");
        return;
      }
    }

    logger.error("Error processing message", { error });
    throw error;
  }
}
