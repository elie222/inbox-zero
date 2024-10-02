import type { gmail_v1 } from "@googleapis/gmail";
import { SPAM_LABEL_ID } from "@/utils/gmail/label";

export async function markSpam(options: {
  gmail: gmail_v1.Gmail;
  threadId: string;
}) {
  const { gmail, threadId } = options;

  return gmail.users.threads.modify({
    userId: "me",
    id: threadId,
    requestBody: {
      addLabelIds: [SPAM_LABEL_ID],
    },
  });
}
