import type { gmail_v1 } from "googleapis";
import {
  getOrCreateLabel,
  INBOX_LABEL_ID,
  labelMessage,
} from "@/utils/gmail/label";
import { inboxZeroLabels } from "@/utils/label";
import prisma from "@/utils/prisma";
import { NewsletterStatus } from "@prisma/client";

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

  const unsubscribeLabel = await getOrCreateLabel({
    gmail,
    name: inboxZeroLabels.unsubscribed,
  });
  if (!unsubscribeLabel?.id) console.error("No gmail label id");

  await labelMessage({
    gmail,
    messageId,
    // label email as "Unsubscribed"
    addLabelIds: unsubscribeLabel?.id ? [unsubscribeLabel.id] : undefined,
    // archive email
    removeLabelIds: [INBOX_LABEL_ID],
  });

  return true;
}
