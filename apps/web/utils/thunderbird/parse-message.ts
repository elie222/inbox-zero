import type { ParsedMessage } from "@/utils/types";
import type { ThunderbirdInboundMessage } from "@/utils/thunderbird/auth";

export function toParsedMessageFromThunderbird(
  input: ThunderbirdInboundMessage,
): ParsedMessage {
  const stableId =
    input.messageId ||
    input.headerMessageId ||
    `tb-${input.thunderbirdAccountId}-${input.thunderbirdMessageId}`;
  const threadId =
    input.threadId ||
    input.inReplyTo ||
    input.headerMessageId ||
    stableId;
  const date = input.date || new Date().toISOString();
  const snippet =
    input.snippet ||
    (input.textPlain || input.textHtml || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);

  const labelIds: string[] = [];
  if (input.read) labelIds.push("READ");
  if (input.flagged) labelIds.push("STARRED");
  if (input.isSent) labelIds.push("SENT");
  if (input.tags) labelIds.push(...input.tags);

  return {
    id: stableId,
    threadId,
    historyId: String(input.thunderbirdMessageId),
    date,
    internalDate: date,
    snippet,
    subject: input.subject,
    textPlain: input.textPlain,
    textHtml: input.textHtml,
    bodyContentType: input.textHtml ? "html" : "text",
    labelIds,
    inline: [],
    headers: {
      from: input.from,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      date,
      "message-id": input.headerMessageId || stableId,
      "in-reply-to": input.inReplyTo,
      references: input.references,
      ...(input.listUnsubscribe
        ? { "list-unsubscribe": input.listUnsubscribe }
        : {}),
    },
  };
}
