import type { StoredMailMutation } from "@/utils/email-cache/database";
import { rewriteInlineImageSources } from "@/utils/email/inline-images";
import type { ParsedMessage } from "@/utils/types";
import type { SendEmailBody } from "@/utils/types/mail";

export function getOutboxReplyMessage(
  row: StoredMailMutation,
  messageIds: string[],
  userEmail: string,
): ParsedMessage | undefined {
  const result = row.result as
    | { messageId?: string; threadId?: string }
    | undefined;
  if (
    row.kind !== "reply" ||
    (result?.messageId && messageIds.includes(result.messageId)) ||
    (result?.threadId && result.threadId !== row.threadId)
  )
    return;

  const { email } = row.payload as { email: SendEmailBody };
  const date = new Date(row.createdAt).toISOString();
  const inlineSources = Object.fromEntries(
    (email.attachments ?? []).flatMap((attachment) =>
      attachment.disposition === "inline" && attachment.contentId
        ? [
            [
              attachment.contentId,
              `data:${attachment.contentType};base64,${attachment.content}`,
            ],
          ]
        : [],
    ),
  );
  return {
    id: `outbox:${row.id}`,
    threadId: row.threadId,
    date,
    internalDate: String(row.createdAt),
    headers: {
      from: email.from || userEmail,
      to: email.to,
      cc: email.cc,
      bcc: email.bcc,
      subject: email.subject,
      date,
    },
    subject: email.subject,
    textHtml: rewriteInlineImageSources(email.messageHtml, inlineSources),
    snippet: "",
    historyId: "",
    inline: [],
    labelIds: row.status === "succeeded" ? ["SENT"] : [],
  };
}
