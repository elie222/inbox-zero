import type { gmail_v1 } from "@googleapis/gmail";
import { extractEmailAddress } from "@/utils/email";
import { getMessage } from "@/utils/gmail/message";
import { getThreadsWithNextPageToken } from "@/utils/gmail/thread";
import type { MessageWithPayload } from "@/utils/types";

export async function findSenders(gmail: gmail_v1.Gmail) {
  const senders = new Set<string>();

  const { threads, nextPageToken } = await getThreadsWithNextPageToken(
    `-in:sent`,
    [],
    gmail,
  );

  for (const thread of threads) {
    const firstMessage = thread.messages?.[0];
    if (!firstMessage?.id) continue;
    const message = await getMessage(firstMessage.id, gmail, "metadata");

    const sender = extractSenderInfo(message);
    if (sender) senders.add(sender);
  }

  return { senders: Array.from(senders), nextPageToken };
}

function extractSenderInfo(message: MessageWithPayload) {
  const fromHeader = message.payload?.headers?.find((h) => h.name === "From");
  if (!fromHeader?.value) return null;

  return extractEmailAddress(fromHeader.value);
}
