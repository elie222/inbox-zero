import prisma from "@/utils/prisma";
import { NewsletterStatus } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";
import { extractEmailAddress } from "@/utils/email";
import type { EmailProvider } from "@/utils/email/types";

const logger = createScopedLogger("outlook/webhook/block-unsubscribed-emails");

export async function blockUnsubscribedEmails({
  from,
  emailAccountId,
  provider,
  messageId,
  ownerEmail,
}: {
  from: string;
  emailAccountId: string;
  provider: EmailProvider;
  messageId: string;
  ownerEmail: string;
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
    await provider.archiveMessage(messageId);
    await provider.markRead(messageId);

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
