import type { gmail_v1 } from "@googleapis/gmail";
import { getBatch } from "@/utils/gmail/batch";
import {
  isDefined,
  type ThreadWithPayloadMessages,
  type MessageWithPayload,
} from "@/utils/types";
import { parseMessage } from "@/utils/gmail/message";
import { GmailLabel } from "@/utils/gmail/label";

export async function getThread(
  threadId: string,
  gmail: gmail_v1.Gmail,
): Promise<ThreadWithPayloadMessages> {
  const thread = await gmail.users.threads.get({ userId: "me", id: threadId });
  return thread.data as ThreadWithPayloadMessages;
}

interface MinimalThread {
  id: string;
  snippet: string;
  historyId: string;
}

export async function getThreads(
  q: string,
  labelIds: string[],
  gmail: gmail_v1.Gmail,
  maxResults = 100,
): Promise<{
  nextPageToken?: string | null;
  resultSizeEstimate?: number | null;
  threads: MinimalThread[];
}> {
  const threads = await gmail.users.threads.list({
    userId: "me",
    q,
    labelIds,
    maxResults,
  });
  return {
    nextPageToken: threads.data.nextPageToken,
    resultSizeEstimate: threads.data.resultSizeEstimate,
    threads: (threads.data.threads || []) as MinimalThread[],
  };
}

export async function getThreadsWithNextPageToken({
  gmail,
  q,
  labelIds,
  maxResults = 100,
  pageToken,
}: {
  gmail: gmail_v1.Gmail;
  q?: string;
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
): Promise<ThreadWithPayloadMessages[]> {
  const batch = await getBatch(
    threadIds,
    "/gmail/v1/users/me/threads",
    accessToken,
  );

  return batch;
}

async function getThreadsFromSender(
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

export async function getThreadsFromSenderWithSubject(
  gmail: gmail_v1.Gmail,
  accessToken: string,
  sender: string,
  limit: number,
): Promise<
  Array<{
    id: string;
    snippet: string;
    subject: string;
  }>
> {
  const threads = await getThreadsFromSender(gmail, sender, limit);
  const threadIds = threads.map((t) => t.id).filter(isDefined);
  const threadsWithSubject = await getThreadsBatch(threadIds, accessToken);
  return threadsWithSubject
    .map((t) =>
      t.id
        ? {
            id: t.id,
            subject:
              t.messages?.[0]?.payload?.headers?.find(
                (h) => h.name === "Subject",
              )?.value || "",
            snippet: t.messages?.[0]?.snippet || "",
          }
        : undefined,
    )
    .filter(isDefined);
}

export async function getThreadMessages(
  threadId: string,
  gmail: gmail_v1.Gmail,
) {
  const thread = await getThread(threadId, gmail);
  if (!thread?.messages) return [];
  return thread.messages
    .map((m) => parseMessage(m as MessageWithPayload))
    .filter((m) => !m.labelIds?.includes(GmailLabel.DRAFT));
}
