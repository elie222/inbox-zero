import { gmail_v1 } from "googleapis";

export async function markSpam(options: {
  gmail: gmail_v1.Gmail;
  threadId: string;
}) {
  const { gmail, threadId } = options;

  return gmail.users.threads.modify({
    userId: "me",
    id: threadId,
    requestBody: {
      addLabelIds: ["SPAM"],
    },
  });
}
