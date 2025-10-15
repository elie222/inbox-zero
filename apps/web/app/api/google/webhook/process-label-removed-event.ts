import type { gmail_v1 } from "@googleapis/gmail";
import prisma from "@/utils/prisma";
import { ColdEmailStatus, SystemType } from "@prisma/client";
import { extractEmailAddress } from "@/utils/email";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailProvider } from "@/utils/email/types";
import { GmailLabel } from "@/utils/gmail/label";
import { getRuleLabel } from "@/utils/rule/consts";
import type { Logger } from "@/utils/logger";

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
  logger: Logger,
) {
  const messageId = message.message?.id;
  const threadId = message.message?.threadId;
  const emailAccountId = emailAccount.id;
  const userEmail = emailAccount.email;

  if (!messageId || !threadId) {
    logger.warn("Skipping label removal - missing messageId or threadId");
    return;
  }

  logger.info("Processing label removal for learning");

  let sender: string | null = null;

  try {
    const parsedMessage = await provider.getMessage(messageId);
    sender = extractEmailAddress(parsedMessage.headers.from);
  } catch (error) {
    logger.error("Error getting sender for label removal", {
      error,
    });
  }

  // Filter out system labels early as we don't learn from them
  const removedLabelIds = (message.labelIds || []).filter(
    (labelId) => !SYSTEM_LABELS.includes(labelId),
  );

  if (removedLabelIds.length === 0) {
    logger.trace("No non-system labels to process");
    return;
  }

  const labels = await provider.getLabels();

  for (const labelId of removedLabelIds) {
    const label = labels?.find((l) => l.id === labelId);
    const labelName = label?.name;

    if (!labelName) {
      logger.info("Skipping label removal - missing label name", {
        labelId,
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
        logger,
      });
    } catch (error) {
      logger.error("Error learning from label removal", {
        error,
        labelName,
        removedLabelIds,
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
  logger,
}: {
  labelName: string;
  sender: string | null;
  messageId: string;
  threadId: string;
  emailAccountId: string;
  logger: Logger;
}) {
  logger = logger.with({
    labelName,
    sender,
  });

  // Can't learn patterns without knowing who to exclude
  if (!sender) {
    logger.info("No sender found, skipping learning");
    return;
  }

  if (labelName === getRuleLabel(SystemType.COLD_EMAIL)) {
    logger.info("Processing Cold Email label removal");

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
