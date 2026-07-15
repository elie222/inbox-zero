export function getStableMessageCacheKey(
  messages:
    | Array<{
        attachments?: unknown;
        headers?: {
          from?: unknown;
          subject?: unknown;
          to?: unknown;
        };
        id?: unknown;
        labelIds?: unknown;
        snippet?: unknown;
        subject?: unknown;
        textHtml?: unknown;
        textPlain?: unknown;
        threadId?: unknown;
      }>
    | undefined,
) {
  return messages?.map((message) => ({
    id: message.id,
    threadId: message.threadId,
    from: message.headers?.from,
    to: message.headers?.to,
    subject: message.headers?.subject ?? message.subject,
    snippet: message.snippet,
    textPlain: message.textPlain,
    textHtml: message.textHtml,
    labelIds: message.labelIds,
    attachments: message.attachments,
  }));
}
