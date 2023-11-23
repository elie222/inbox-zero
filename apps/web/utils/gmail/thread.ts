import { getBatch } from "@/utils/gmail/batch";
import { gmail_v1 } from "googleapis";

export async function getThread(threadId: string, gmail: gmail_v1.Gmail) {
  const thread = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
  });

  return thread.data;
}

export async function getThreadsBatch(
  threadIds: string[],
  accessToken: string,
): Promise<gmail_v1.Schema$Thread[]> {
  const batch = await getBatch(
    threadIds,
    "/gmail/v1/users/me/threads",
    accessToken,
  );

  return batch;
}
