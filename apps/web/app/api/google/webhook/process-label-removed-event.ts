import type { gmail_v1 } from "@googleapis/gmail";
import prisma from "@/utils/prisma";

import { ActionType, ColdEmailStatus } from "@prisma/client";
import { logger } from "@/app/api/google/webhook/logger";
import { extractEmailAddress } from "@/utils/email";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailProvider } from "@/utils/email/types";
import { inboxZeroLabels } from "@/utils/label";
import { GmailLabel } from "@/utils/gmail/label";
import { saveLearnedPatterns } from "@/utils/rule/learned-patterns";

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
    gmail,
    emailAccount,
    provider,
  }: {
    gmail: gmail_v1.Gmail;
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

  try {
    const parsedMessage = await provider.getMessage(messageId);
    const sender = extractEmailAddress(parsedMessage.headers.from);

    const removedLabelIds = message.labelIds || [];

    const labels = await gmail.users.labels.list({ userId: "me" });

    const removedLabelNames = removedLabelIds
      .map((labelId: string) => {
        const label = labels.data.labels?.find(
          (l: gmail_v1.Schema$Label) => l.id === labelId,
        );
        return label?.name;
      })
      .filter(
        (labelName: string | null | undefined): labelName is string =>
          !!labelName && !SYSTEM_LABELS.includes(labelName),
      );

    for (const labelName of removedLabelNames) {
      await learnFromRemovedLabel({
        labelName,
        sender,
        messageId,
        threadId,
        emailAccountId,
      });
    }
  } catch (error) {
    logger.error("Error processing label removal", { error, ...loggerOptions });
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
