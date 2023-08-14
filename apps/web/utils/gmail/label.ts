import { gmail_v1 } from "googleapis";

export async function labelThread(options: {
  gmail: gmail_v1.Gmail;
  threadId: string;
  labelId: string;
}) {
  const { gmail, threadId, labelId } = options;

  return gmail.users.threads.modify({
    userId: "me",
    id: threadId,
    requestBody: {
      addLabelIds: [labelId],
    },
  });
}
