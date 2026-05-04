import type { gmail_v1 } from "@googleapis/gmail";
import { GmailLabel } from "./label";
import { env } from "@/env";
import {
  extractErrorInfo,
  isExistingGmailPushClientError,
  withGmailRetry,
} from "@/utils/gmail/retry";

export async function watchGmail(gmail: gmail_v1.Gmail) {
  if (env.GOOGLE_PUBSUB_VERIFICATION_TOKEN == null) {
    throw new Error(
      "GOOGLE_PUBSUB_VERIFICATION_TOKEN is required to watch Gmail",
    );
  }

  try {
    return await startGmailWatch(gmail);
  } catch (error) {
    if (!isExistingGmailPushClientError(extractErrorInfo(error))) throw error;

    await unwatchGmail(gmail);
    return await startGmailWatch(gmail);
  }
}

export async function unwatchGmail(gmail: gmail_v1.Gmail) {
  await withGmailRetry(() => gmail.users.stop({ userId: "me" }));
}

async function startGmailWatch(gmail: gmail_v1.Gmail) {
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
