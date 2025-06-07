import type { gmail_v1 } from "@googleapis/gmail";
import prisma from "@/utils/prisma";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import { captureException } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { watchGmail, unwatchGmail } from "@/utils/gmail/watch";

const logger = createScopedLogger("google/watch");

export async function watchEmails({
  emailAccountId,
  gmail,
}: {
  emailAccountId: string;
  gmail: gmail_v1.Gmail;
}) {
  logger.info("Watching emails", { emailAccountId });
  const res = await watchGmail(gmail);

  if (res.expiration) {
    const expirationDate = new Date(+res.expiration);
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
  accessToken,
  refreshToken,
  expiresAt,
}: {
  emailAccountId: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
}) {
  try {
    logger.info("Unwatching emails", { emailAccountId });
    const gmail = await getGmailClientWithRefresh({
      accessToken,
      refreshToken,
      expiresAt,
      emailAccountId,
    });
    await unwatchGmail(gmail);
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
