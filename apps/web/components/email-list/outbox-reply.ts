import { z } from "zod";
import type { StoredMailMutation } from "@/utils/email-cache/database";
import { rewriteInlineImageSources } from "@/utils/email/inline-images";
import type { ParsedMessage } from "@/utils/types";
import { sendEmailBody } from "@/utils/types/mail";

// Previewing saved data needs field validation, not send-time byte and size checks.
const outboxReplyEmail = z.object(sendEmailBody.shape);

export function getOutboxReplyPreview(
  row: StoredMailMutation,
  messageIds: string[],
  userEmail: string,
) {
  const result = row.result as
    | { messageId?: string; threadId?: string }
    | undefined;
  if (
    row.kind !== "reply" ||
    (result?.messageId && messageIds.includes(result.messageId)) ||
    (result?.threadId && result.threadId !== row.threadId)
  )
    return;

  if (
    !row.payload ||
    typeof row.payload !== "object" ||
    !("email" in row.payload)
  )
    return;
  const parsed = outboxReplyEmail.safeParse(row.payload.email);
  if (!parsed.success) return;
  const email = parsed.data;
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
  const message: ParsedMessage = {
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
  return { message, attachments: email.attachments ?? [] };
}
