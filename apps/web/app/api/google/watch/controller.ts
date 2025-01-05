import type { gmail_v1 } from "@googleapis/gmail";
import prisma from "@/utils/prisma";
import { INBOX_LABEL_ID } from "@/utils/gmail/label";
import { env } from "@/env";
import { getGmailClient } from "@/utils/gmail/client";
import { captureException } from "@/utils/error";
import { unwatchUser, watchUser } from "@/utils/gmail/misc";

export async function watchEmails(userId: string, gmail: gmail_v1.Gmail) {
  const res = await watchUser(gmail, {
    labelIds: [INBOX_LABEL_ID],
    labelFilterBehavior: "include",
    topicName: env.GOOGLE_PUBSUB_TOPIC_NAME,
  });

  if (res.expiration) {
    const expirationDate = new Date(+res.expiration);
    await prisma.user.update({
      where: { id: userId },
      data: { watchEmailsExpirationDate: expirationDate },
    });
    return expirationDate;
  }
  console.error("Error watching inbox", res);
}

async function unwatch(gmail: gmail_v1.Gmail) {
  console.log("Unwatching emails");
  await unwatchUser(gmail);
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
      console.error("Error unwatching emails, invalid grant");
      return;
    }

    console.error("Error unwatching emails", error);
    captureException(error);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { watchEmailsExpirationDate: null },
  });
}
