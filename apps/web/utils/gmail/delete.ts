import { gmail_v1 } from "googleapis";

export async function deleteThread(options: {
  gmail: gmail_v1.Gmail;
  threadId: string;
}) {
  const { gmail, threadId } = options;

  return gmail.users.threads.delete({
    userId: "me",
    id: threadId,
  });
}

export async function deleteMessage(options: {
  gmail: gmail_v1.Gmail;
  messageId: string;
}) {
  const { gmail, messageId } = options;

  return gmail.users.messages.delete({
    userId: "me",
    id: messageId,
  });
}
