import type { Client } from "@microsoft/microsoft-graph-client";
import prisma from "@/utils/prisma";
import { NewsletterStatus } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";
import { extractEmailAddress } from "@/utils/email";

const logger = createScopedLogger("outlook/webhook/block-unsubscribed-emails");

export async function blockUnsubscribedEmails({
  from,
  emailAccountId,
  client,
  messageId,
}: {
  from: string;
  emailAccountId: string;
  client: Client;
  messageId: string;
}): Promise<boolean> {
  const email = extractEmailAddress(from);
  const sender = await prisma.newsletter.findFirst({
    where: {
      emailAccountId,
      email,
      status: NewsletterStatus.UNSUBSCRIBED,
    },
  });

  if (!sender) return false;

  try {
    // Move to Archive folder
    await client.api(`/me/messages/${messageId}/move`).post({
      destinationId: "archive",
    });

    // Mark as read
    await client.api(`/me/messages/${messageId}`).patch({
      isRead: true,
    });

    logger.info("Moved unsubscribed email to archive", {
      messageId,
      email: from,
    });
    return true;
  } catch (error) {
    logger.error("Failed to move unsubscribed email", {
      error,
      messageId,
      email: from,
    });
    return false;
  }
}
