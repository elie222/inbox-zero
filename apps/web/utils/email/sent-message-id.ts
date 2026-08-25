export function requireSentMessageId(messageId?: string | null) {
  if (!messageId) throw new Error("Provider did not return a sent message ID");
  return messageId;
}
