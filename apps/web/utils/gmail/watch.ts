import type { gmail_v1 } from "@googleapis/gmail";
import { GmailLabel } from "./label";
import { env } from "@/env";
import { withGmailRetry } from "@/utils/gmail/retry";

export async function watchGmail(gmail: gmail_v1.Gmail) {
  if (env.GOOGLE_PUBSUB_VERIFICATION_TOKEN == null) {
    throw new Error(
      "GOOGLE_PUBSUB_VERIFICATION_TOKEN is required to watch Gmail",
    );
  }

  const res = await withGmailRetry(() =>
    gmail.users.watch({
      userId: "me",
      requestBody: {
        labelIds: [GmailLabel.INBOX, GmailLabel.SENT],
        labelFilterBehavior: "include",
        topicName: env.GOOGLE_PUBSUB_TOPIC_NAME,
      },
    }),
  );

  return res.data;
}

export async function unwatchGmail(gmail: gmail_v1.Gmail) {
  await withGmailRetry(() => gmail.users.stop({ userId: "me" }));
}
