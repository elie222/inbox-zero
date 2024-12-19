import type { gmail_v1 } from "@googleapis/gmail";
import { getBatch } from "@/utils/gmail/batch";

export async function getThread(threadId: string, gmail: gmail_v1.Gmail) {
  const thread = await gmail.users.threads.get({ userId: "me", id: threadId });
  return thread.data;
}

export async function getThreads(
  q: string,
  labelIds: string[],
  gmail: gmail_v1.Gmail,
  maxResults = 100,
) {
  const threads = await gmail.users.threads.list({
    userId: "me",
    q,
    labelIds,
    maxResults,
  });
  return threads.data || [];
}

export async function getThreadsWithNextPageToken({
  gmail,
  q,
  labelIds,
  maxResults = 100,
  pageToken,
}: {
  gmail: gmail_v1.Gmail;
  q: string;
  labelIds?: string[];
  maxResults?: number;
  pageToken?: string;
}) {
  const threads = await gmail.users.threads.list({
    userId: "me",
    q,
    labelIds,
    maxResults,
    pageToken,
  });

  return {
    threads: threads.data.threads || [],
    nextPageToken: threads.data.nextPageToken,
  };
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

export async function getThreadsFromSender(
  gmail: gmail_v1.Gmail,
  sender: string,
  limit: number,
): Promise<
  Array<{
    id?: string | null;
    threadId?: string | null;
    snippet?: string | null;
  }>
> {
  const query = `from:${sender} -label:sent -label:draft`;
  const response = await gmail.users.threads.list({
    userId: "me",
    q: query,
    maxResults: limit,
  });

  return response.data.threads || [];
}
