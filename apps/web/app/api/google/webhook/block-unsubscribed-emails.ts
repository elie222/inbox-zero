import type { gmail_v1 } from "@googleapis/gmail";
import {
  getOrCreateInboxZeroLabel,
  GmailLabel,
  labelMessage,
} from "@/utils/gmail/label";
import prisma from "@/utils/prisma";
import { NewsletterStatus } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("google/webhook/block-unsubscribed-emails");

export async function blockUnsubscribedEmails({
  from,
  userId,
  gmail,
  messageId,
}: {
  from: string;
  userId: string;
  gmail: gmail_v1.Gmail;
  messageId: string;
}): Promise<boolean> {
  const sender = await prisma.newsletter.findFirst({
    where: {
      userId,
      email: from,
      status: NewsletterStatus.UNSUBSCRIBED,
    },
  });

  if (!sender) return false;

  const unsubscribeLabel = await getOrCreateInboxZeroLabel({
    gmail,
    key: "unsubscribed",
  });
  if (!unsubscribeLabel?.id) logger.error("No gmail label id", { userId });

  await labelMessage({
    gmail,
    messageId,
    // label email as "Unsubscribed"
    addLabelIds: unsubscribeLabel?.id ? [unsubscribeLabel.id] : undefined,
    // archive email
    removeLabelIds: [GmailLabel.INBOX],
  });

  return true;
}
