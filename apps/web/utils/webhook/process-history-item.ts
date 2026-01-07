import { after } from "next/server";
import prisma from "@/utils/prisma";
import { runRules } from "@/utils/ai/choose-rule/run-rules";
import { categorizeSender } from "@/utils/categorize/senders/categorize";
import { isAssistantEmail } from "@/utils/assistant/is-assistant-email";
import { processAssistantEmail } from "@/utils/assistant/process-assistant-email";
import { isFilebotEmail } from "@/utils/filebot/is-filebot-email";
import { processFilingReply } from "@/utils/drive/handle-filing-reply";
import {
  processAttachment,
  getExtractableAttachments,
} from "@/utils/drive/filing-engine";
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
    Pick<
      EmailAccount,
      "autoCategorizeSenders" | "filingEnabled" | "filingPrompt" | "email"
    >;
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

    const isForFilebot = isFilebotEmail({
      userEmail,
      emailToCheck: parsedMessage.headers.to,
    });

    if (isForFilebot) {
      logger.info("Processing filebot reply.");
      return processFilingReply({
        message: parsedMessage,
        emailAccountId,
        userEmail,
        emailProvider: provider,
        emailAccount,
        logger,
      });
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

    // Process attachments for document filing (runs in parallel with rules if both enabled)
    if (
      emailAccount.filingEnabled &&
      emailAccount.filingPrompt &&
      hasAiAccess
    ) {
      after(async () => {
        const extractableAttachments = getExtractableAttachments(parsedMessage);

        if (extractableAttachments.length > 0) {
          logger.info("Processing attachments for filing", {
            count: extractableAttachments.length,
          });

          // Process each attachment (don't await all - let them run in background)
          for (const attachment of extractableAttachments) {
            await processAttachment({
              emailAccount: {
                ...emailAccount,
                filingEnabled: emailAccount.filingEnabled,
                filingPrompt: emailAccount.filingPrompt,
                email: emailAccount.email,
              },
              message: parsedMessage,
              attachment,
              emailProvider: provider,
              logger,
            }).catch((error) => {
              logger.error("Failed to process attachment", {
                filename: attachment.filename,
                error,
              });
            });
          }
        }
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
