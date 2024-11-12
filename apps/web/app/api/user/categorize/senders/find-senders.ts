import type { gmail_v1 } from "@googleapis/gmail";
import { getMessagesBatch } from "@/utils/gmail/message";
import { getThreadsWithNextPageToken } from "@/utils/gmail/thread";
import { isDefined } from "@/utils/types";
import type { SenderMap } from "@/app/api/user/categorize/senders/types";

export async function findSendersWithPagination(
  gmail: gmail_v1.Gmail,
  accessToken: string,
  maxPages: number,
) {
  const allSenders: SenderMap = new Map();
  let nextPageToken: string | undefined = undefined;
  let currentPage = 0;

  while (currentPage < maxPages) {
    const { senders, nextPageToken: newNextPageToken } = await findSenders(
      gmail,
      accessToken,
      50,
      nextPageToken,
    );

    for (const [sender, messages] of Object.entries(senders)) {
      const existingMessages = allSenders.get(sender) ?? [];
      allSenders.set(sender, [...existingMessages, ...messages]);
    }

    if (!newNextPageToken) break; // No more pages

    nextPageToken = newNextPageToken;
    currentPage++;
  }

  return { senders: allSenders, nextPageToken };
}

export async function findSenders(
  gmail: gmail_v1.Gmail,
  accessToken: string,
  maxResults: number,
  pageToken?: string,
) {
  const senders: SenderMap = new Map();

  const { threads, nextPageToken } = await getThreadsWithNextPageToken({
    q: "-in:sent",
    gmail,
    maxResults,
    pageToken,
  });

  const messageIds = threads.map((t) => t.id).filter(isDefined);
  const messages = await getMessagesBatch(messageIds, accessToken);

  for (const message of messages) {
    const sender = message.headers.from;
    if (sender) {
      const existingMessages = senders.get(sender) ?? [];
      senders.set(sender, [...existingMessages, message]);
    }
  }

  return { senders, nextPageToken };
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "errors" in error &&
    Array.isArray((error as any).errors) &&
    (error as any).errors.some(
      (e: any) =>
        e.message === "Requested entity was not found." &&
        e.reason === "notFound",
    )
  );
}
