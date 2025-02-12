import type { gmail_v1 } from "@googleapis/gmail";
import prisma from "@/utils/prisma";
import { GmailLabel } from "@/utils/gmail/label";
import { env } from "@/env";
import { getGmailClient } from "@/utils/gmail/client";
import { captureException } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("google/watch");

export async function watchEmails(userId: string, gmail: gmail_v1.Gmail) {
  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      labelIds: [GmailLabel.INBOX, GmailLabel.SENT],
      labelFilterBehavior: "include",
      topicName: env.GOOGLE_PUBSUB_TOPIC_NAME,
    },
  });

  if (res.data.expiration) {
    const expirationDate = new Date(+res.data.expiration);
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
  await gmail.users.stop({ userId: "me" });
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
      logger.error("Error unwatching emails, invalid grant", { userId });
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
