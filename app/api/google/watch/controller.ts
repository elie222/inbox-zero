import { gmail_v1 } from "googleapis";
import prisma from "@/utils/prisma";
import { INBOX_LABEL_ID } from "@/utils/label";

if (!process.env.GOOGLE_PUBSUB_TOPIC_NAME)
  throw new Error("Missing env.GOOGLE_PUBSUB_TOPIC_NAME");

export async function watchEmails(userId: string, gmail: gmail_v1.Gmail) {
  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      labelIds: [INBOX_LABEL_ID],
      labelFilterBehavior: "include",
      topicName: process.env.GOOGLE_PUBSUB_TOPIC_NAME,
    },
  });

  if (res.data.expiration) {
    const expirationDate = new Date(+res.data.expiration);
    await prisma.user.update({
      where: { id: userId },
      data: { watchEmailsExpirationDate: expirationDate },
    });
    return expirationDate;
  } else {
    console.error("Error watching inbox", res.data);
  }
}
