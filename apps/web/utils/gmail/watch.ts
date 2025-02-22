import type { gmail_v1 } from "@googleapis/gmail";
import { GmailLabel } from "./label";
import { env } from "@/env";

export async function watchGmail(gmail: gmail_v1.Gmail) {
  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      labelIds: [GmailLabel.INBOX, GmailLabel.SENT],
      labelFilterBehavior: "include",
      topicName: env.GOOGLE_PUBSUB_TOPIC_NAME,
    },
  });

  return res.data;
}

export async function unwatchGmail(gmail: gmail_v1.Gmail) {
  await gmail.users.stop({ userId: "me" });
}
