import { gmail_v1 } from "googleapis";

export async function getThread(threadId: string, gmail: gmail_v1.Gmail) {
  const message = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
  });

  return message.data;
}
