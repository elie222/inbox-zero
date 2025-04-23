import type { gmail_v1 } from "@googleapis/gmail";
import prisma from "@/utils/prisma";
import { getGmailClientFromAccount } from "@/utils/gmail/client";
import { captureException } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { watchGmail, unwatchGmail } from "@/utils/gmail/watch";

const logger = createScopedLogger("google/watch");

export async function watchEmails({
  email,
  gmail,
}: {
  email: string;
  gmail: gmail_v1.Gmail;
}) {
  const res = await watchGmail(gmail);

  if (res.expiration) {
    const expirationDate = new Date(+res.expiration);
    await prisma.emailAccount.update({
      where: { email },
      data: { watchEmailsExpirationDate: expirationDate },
    });
    return expirationDate;
  }
  logger.error("Error watching inbox", { email });
}

async function unwatch(gmail: gmail_v1.Gmail) {
  logger.info("Unwatching emails");
  await unwatchGmail(gmail);
}

export async function unwatchEmails({
  email,
  access_token,
  refresh_token,
}: {
  email: string;
  access_token: string | null;
  refresh_token: string | null;
}) {
  try {
    const gmail = getGmailClientFromAccount({ access_token, refresh_token });
    await unwatch(gmail);
  } catch (error) {
    if (error instanceof Error && error.message.includes("invalid_grant")) {
      logger.warn("Error unwatching emails, invalid grant", { email });
      return;
    }

    logger.error("Error unwatching emails", { email, error });
    captureException(error);
  }

  await prisma.emailAccount.update({
    where: { email },
    data: { watchEmailsExpirationDate: null },
  });
}
