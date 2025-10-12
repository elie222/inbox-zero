import prisma from "@/utils/prisma";
import { captureException } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import type { EmailProvider } from "@/utils/email/types";

const logger = createScopedLogger("google/watch");

export async function watchEmails({
  emailAccountId,
  emailProvider,
}: {
  emailAccountId: string;
  emailProvider: EmailProvider;
}) {
  logger.info("Watching emails", { emailAccountId });
  const res = await emailProvider.watchEmails();

  if (res?.expirationDate) {
    const expirationDate = new Date(res.expirationDate);
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { watchEmailsExpirationDate: expirationDate },
    });
    return expirationDate;
  }
  logger.error("Error watching inbox", { emailAccountId });
}

export async function unwatchEmails({
  emailAccountId,
  emailProvider,
}: {
  emailAccountId: string;
  emailProvider: EmailProvider;
}) {
  try {
    logger.info("Unwatching emails", { emailAccountId });
    await emailProvider.unwatchEmails();
  } catch (error) {
    if (error instanceof Error && error.message.includes("invalid_grant")) {
      logger.warn("Error unwatching emails, invalid grant", { emailAccountId });
      return;
    }

    logger.error("Error unwatching emails", { emailAccountId, error });
    captureException(error);
  }

  await prisma.emailAccount.update({
    where: { id: emailAccountId },
    data: { watchEmailsExpirationDate: null },
  });
}
