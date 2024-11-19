import type { gmail_v1 } from "@googleapis/gmail";
import { getMessagesBatch } from "@/utils/gmail/message";
import { getThreadsWithNextPageToken } from "@/utils/gmail/thread";
import { isDefined, type ParsedMessage } from "@/utils/types";
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
  oldestDate?: Date | null,
  newestDate?: Date | null,
) {
  const senders: SenderMap = new Map();

  let dateFilter = "";
  if (oldestDate) dateFilter += ` before:${oldestDate.getTime() / 1000}`;
  if (newestDate) dateFilter += ` after:${newestDate.getTime() / 1000}`;

  const { threads, nextPageToken } = await getThreadsWithNextPageToken({
    q: `-in:sent${dateFilter}`,
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

  const dateRange = findMessageDateRange(messages);

  return { senders, nextPageToken, dateRange };
}

function findMessageDateRange(messages: ParsedMessage[]): {
  oldestDate: Date | null;
  newestDate: Date | null;
} {
  if (!messages.length) return { oldestDate: null, newestDate: null };

  const dates = messages
    .map((msg) => msg.internalDate)
    .filter(isDefined)
    .map((timestamp) => new Date(Number(timestamp)));

  return {
    oldestDate: dates.length
      ? new Date(Math.min(...dates.map((d) => d.getTime())))
      : null,
    newestDate: dates.length
      ? new Date(Math.max(...dates.map((d) => d.getTime())))
      : null,
  };
}
