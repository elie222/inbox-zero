import type { gmail_v1 } from "@googleapis/gmail";
import chunk from "lodash/chunk";
import {
  getMessage,
  getMessagesBatch,
  parseMessage,
} from "@/utils/gmail/message";
import { extractErrorInfo } from "@/utils/gmail/retry";
import type { Logger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";

export async function getGmailSyncMessages({
  gmail,
  messageIds,
  accessToken,
  logger,
}: {
  gmail: gmail_v1.Gmail;
  messageIds: string[];
  accessToken: string;
  logger: Logger;
}) {
  const messages: ParsedMessage[] = [];
  const confirmedDeletedMessageIds: string[] = [];
  for (const ids of chunk([...new Set(messageIds)], 100)) {
    const page = await getMessagesBatch({
      messageIds: ids,
      accessToken,
      logger,
    });
    const requestedIds = new Set(ids);
    const fetched = new Map<string, ParsedMessage>();
    for (const message of page) {
      if (!requestedIds.has(message.id) || fetched.has(message.id)) {
        throw new Error("Gmail returned an unexpected sync message ID");
      }
      fetched.set(message.id, message);
    }
    // Shared batch reads can omit failures; only a confirmed 404 is a deletion.
    for (const id of ids) {
      if (fetched.has(id)) continue;
      try {
        const message = await getMessage(id, gmail, "full");
        if (message.id !== id)
          throw new Error("Gmail returned an unexpected message ID");
        fetched.set(id, parseMessage(message));
      } catch (error) {
        if (extractErrorInfo(error).status !== 404) throw error;
        confirmedDeletedMessageIds.push(id);
      }
    }
    messages.push(...fetched.values());
  }
  return { messages, confirmedDeletedMessageIds };
}
