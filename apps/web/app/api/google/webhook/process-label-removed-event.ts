import type { gmail_v1 } from "@googleapis/gmail";
import prisma from "@/utils/prisma";

import { ColdEmailStatus } from "@prisma/client";
import { logger } from "@/app/api/google/webhook/logger";
import { extractEmailAddress } from "@/utils/email";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailProvider } from "@/utils/email/types";
import { inboxZeroLabels } from "@/utils/label";
import { GmailLabel } from "@/utils/gmail/label";

const SYSTEM_LABELS = [
  GmailLabel.INBOX,
  GmailLabel.SENT,
  GmailLabel.DRAFT,
  GmailLabel.SPAM,
  GmailLabel.TRASH,
  GmailLabel.IMPORTANT,
  GmailLabel.STARRED,
  GmailLabel.UNREAD,
];

export async function handleLabelRemovedEvent(
  message: gmail_v1.Schema$HistoryLabelRemoved,
  {
    emailAccount,
    provider,
  }: {
    emailAccount: EmailAccountWithAI;
    provider: EmailProvider;
  },
) {
  const messageId = message.message?.id;
  const threadId = message.message?.threadId;
  const emailAccountId = emailAccount.id;
  const userEmail = emailAccount.email;

  const loggerOptions = {
    email: userEmail,
    messageId,
    threadId,
  };

  if (!messageId || !threadId) {
    logger.warn(
      "Skipping label removal - missing messageId or threadId",
      loggerOptions,
    );
    return;
  }

  logger.info("Processing label removal for learning", loggerOptions);

  let sender: string | null = null;

  try {
    const parsedMessage = await provider.getMessage(messageId);
    sender = extractEmailAddress(parsedMessage.headers.from);
  } catch (error) {
    logger.error("Error getting sender for label removal", {
      error,
      ...loggerOptions,
    });
  }

  const removedLabelIds = message.labelIds || [];

  const labels = await provider.getLabels();

  for (const labelId of removedLabelIds) {
    const label = labels?.find((l) => l.id === labelId);
    const labelName = label?.name;

    if (!labelName) {
      logger.info("Skipping label removal - missing label name", {
        labelId,
        ...loggerOptions,
      });
      continue;
    }

    if (SYSTEM_LABELS.includes(labelName)) {
      logger.info("Skipping system label removal", {
        labelName,
        ...loggerOptions,
      });
      continue;
    }

    try {
      await learnFromRemovedLabel({
        labelName,
        sender,
        messageId,
        threadId,
        emailAccountId,
      });
    } catch (error) {
      logger.error("Error learning from label removal", {
        error,
        labelName,
        removedLabelIds,
        ...loggerOptions,
      });
    }
  }
}

async function learnFromRemovedLabel({
  labelName,
  sender,
  messageId,
  threadId,
  emailAccountId,
}: {
  labelName: string;
  sender: string | null;
  messageId: string;
  threadId: string;
  emailAccountId: string;
}) {
  const loggerOptions = {
    emailAccountId,
    messageId,
    threadId,
    labelName,
    sender,
  };

  // Can't learn patterns without knowing who to exclude
  if (!sender) {
    logger.info("No sender found, skipping learning", loggerOptions);
    return;
  }

  if (labelName === inboxZeroLabels.cold_email.name) {
    logger.info("Processing Cold Email label removal", loggerOptions);

    await prisma.coldEmail.upsert({
      where: {
        emailAccountId_fromEmail: {
          emailAccountId,
          fromEmail: sender,
        },
      },
      update: {
        status: ColdEmailStatus.USER_REJECTED_COLD,
      },
      create: {
        status: ColdEmailStatus.USER_REJECTED_COLD,
        fromEmail: sender,
        emailAccountId,
        messageId,
        threadId,
      },
    });

    return;
  }
}
