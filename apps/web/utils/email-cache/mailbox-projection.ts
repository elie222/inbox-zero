import type { ParsedMessage } from "@/utils/types";
import type { CachedMailboxMessage } from "./database";
import { sanitizeCachedMailMessage } from "./message-content";

export function toCachedMailboxMessage(
  emailAccountId: string,
  message: ParsedMessage,
  fetchedAt: number,
  receivedAt: number,
): CachedMailboxMessage {
  const data = sanitizeCachedMailMessage(message);
  data.textPlain = undefined;
  data.textHtml = undefined;
  return {
    emailAccountId,
    messageId: message.id,
    threadId: message.threadId,
    data,
    receivedAt,
    lastAccessedAt: fetchedAt,
  };
}
