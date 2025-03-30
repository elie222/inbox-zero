import type { gmail_v1 } from "@googleapis/gmail";
import prisma from "@/utils/prisma";
import { getGmailClient } from "@/utils/gmail/client";
import { captureException } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { watchGmail, unwatchGmail } from "@/utils/gmail/watch";

const logger = createScopedLogger("google/watch");

export async function watchEmails(userId: string, gmail: gmail_v1.Gmail) {
  const res = await watchGmail(gmail);

  if (res.expiration) {
    const expirationDate = new Date(+res.expiration);
    await prisma.user.update({
      where: { id: userId },
      data: { watchEmailsExpirationDate: expirationDate },
    });
    return expirationDate;
  }
  logger.error("Error watching inbox", { userId });
}

async function unwatch(gmail: gmail_v1.Gmail) {
  logger.info("Unwatching emails");
  await unwatchGmail(gmail);
}

export async function unwatchEmails({
  userId,
  access_token,
  refresh_token,
}: {
  userId: string;
  access_token: string | null;
  refresh_token: string | null;
}) {
  try {
    const gmail = getGmailClient({
      accessToken: access_token ?? undefined,
      refreshToken: refresh_token ?? undefined,
    });
    await unwatch(gmail);
  } catch (error) {
    if (error instanceof Error && error.message.includes("invalid_grant")) {
      logger.warn("Error unwatching emails, invalid grant", { userId });
      return;
    }

    logger.error("Error unwatching emails", { userId, error });
    captureException(error);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { watchEmailsExpirationDate: null },
  });
}
