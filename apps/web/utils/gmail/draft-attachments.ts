import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import type { gmail_v1 } from "@googleapis/gmail";
import type Mail from "nodemailer/lib/mailer";
import type { DraftAttachmentMetadata } from "@/utils/actions/draft-attachments.validation";
import {
  assertDraftAttachmentLimits,
  type DraftMessageUploadPart,
  getDraftMessageUploadLength,
} from "@/utils/email/draft-attachment-upload";
import type { DraftAttachmentsResult } from "@/utils/email/types";
import { DraftNotFoundError, SafeError } from "@/utils/error";
import {
  listGmailAttachmentParts,
  readGmailAttachmentParts,
  toGmailMailAttachment,
} from "@/utils/gmail/attachment";
import { getDraft } from "@/utils/gmail/draft";
import { buildMailMessage } from "@/utils/gmail/mail";
import { withGmailRetry } from "@/utils/gmail/retry";
import { convertEmailHtmlToText } from "@/utils/mail";

type GmailDraft = NonNullable<Awaited<ReturnType<typeof getDraft>>>;

type DraftTextUpdate = {
  messageHtml?: string;
  subject?: string;
  to?: string;
  cc?: string;
  bcc?: string;
};

export async function getGmailDraftAttachments(
  gmail: gmail_v1.Gmail,
  draftId: string,
): Promise<DraftAttachmentsResult | null> {
  const draft = await getDraft(draftId, gmail);
  if (!draft) return null;
  return {
    messageId: draft.id,
    attachments: listGmailAttachmentParts(draft.id, draft.payload).map(
      ({ attachment }) => attachment,
    ),
  };
}

export async function getRequiredGmailDraftAttachments(
  gmail: gmail_v1.Gmail,
  draftId: string,
) {
  const result = await getGmailDraftAttachments(gmail, draftId);
  if (!result) throw draftNotFound();
  return result;
}

/**
 * Gmail has no per-attachment draft API: every change replaces the whole
 * message. Text edits and small attachment changes rebuild it here from what
 * the draft already holds, so the browser never re-sends existing files.
 */
export async function rewriteGmailDraft({
  gmail,
  draftId,
  text,
  addAttachment,
  removeAttachmentId,
}: {
  gmail: gmail_v1.Gmail;
  draftId: string;
  text?: DraftTextUpdate;
  addAttachment?: DraftAttachmentMetadata & { content: Buffer };
  removeAttachmentId?: string;
}) {
  const current = await getRequiredDraft(gmail, draftId);
  const parts = listGmailAttachmentParts(current.id, current.payload);
  if (
    removeAttachmentId &&
    !parts.some(({ attachment }) => attachment.id === removeAttachmentId)
  )
    throw new SafeError("This file is no longer on the draft.");
  const kept = parts.filter(
    ({ attachment }) =>
      attachment.id !== removeAttachmentId &&
      attachment.id !== addAttachment?.id,
  );
  if (addAttachment)
    assertDraftAttachmentLimits(
      kept.map(({ attachment }) => attachment),
      addAttachment.size,
    );
  const attachments = await readGmailAttachmentParts(gmail, kept);
  if (addAttachment)
    attachments.push(
      toGmailMailAttachment(addAttachment, addAttachment.content),
    );

  const message = await buildMailMessage(
    draftMailOptions(current, attachments, text),
  );
  await uploadGmailDraftMessage(
    gmail,
    { draftId, threadId: current.threadId },
    message,
  );
}

/**
 * The full draft message with a slot where each attachment's base64 goes.
 * The server writes every header, the HTML, and the MIME structure; the
 * browser only fills the slots with the bytes of the files.
 */
export async function buildGmailDraftUploadTemplate({
  gmail,
  draftId,
  attachment,
}: {
  gmail: gmail_v1.Gmail;
  draftId: string;
  attachment: DraftAttachmentMetadata;
}) {
  const current = await getRequiredDraft(gmail, draftId);
  const existing = listGmailAttachmentParts(current.id, current.payload)
    .map((part) => part.attachment)
    .filter((item) => item.id !== attachment.id);
  assertDraftAttachmentLimits(existing, attachment.size);
  // Attached emails can't be base64 (RFC 2046), so they have no slot.
  if (
    [...existing, attachment].some((item) =>
      item.mimeType.startsWith("message/"),
    )
  )
    throw new SafeError(
      "Large files can't be added to a draft that has an attached email. Attach a file under 3 MB, or remove the attached email.",
    );

  const slots = [
    ...existing.map((item) => ({
      attachment: item,
      part: {
        type: "attachment" as const,
        attachmentId: item.id,
        size: item.size,
        source: {
          messageId: item.messageId,
          providerAttachmentId: item.providerAttachmentId,
        },
      },
    })),
    {
      attachment,
      part: {
        type: "attachment" as const,
        attachmentId: attachment.id,
        size: attachment.size,
      },
    },
  ].map((slot) => {
    // A short placeholder whose base64 fits one line, so it can be found in
    // the built message and swapped for the real file.
    const content = Buffer.from(randomBytes(15).toString("hex"));
    return { ...slot, content, encoded: content.toString("base64") };
  });
  const built = await buildMailMessage(
    draftMailOptions(
      current,
      slots.map((slot) => toGmailMailAttachment(slot.attachment, slot.content)),
    ),
  );
  // The browser re-encodes the text parts, so a byte outside ASCII would
  // change their length and break the declared upload size.
  if (built.some((byte) => byte > 0x7f))
    throw new Error("Could not prepare the draft upload.");
  const message = built.toString("latin1");

  // Inline images sit in a related part ahead of regular attachments, so the
  // message order can differ from the slot order.
  const located = slots
    .map((slot) => ({ ...slot, index: message.indexOf(slot.encoded) }))
    .sort((a, b) => a.index - b.index);
  const parts: DraftMessageUploadPart[] = [];
  let cursor = 0;
  for (const { part, encoded, index } of located) {
    if (index < cursor) throw new Error("Could not prepare the draft upload.");
    parts.push({ type: "text", text: message.slice(cursor, index) }, part);
    cursor = index + encoded.length;
  }
  parts.push({ type: "text", text: message.slice(cursor) });

  return {
    threadId: current.threadId,
    parts,
    totalBytes: getDraftMessageUploadLength(parts),
  };
}

/**
 * Uses Gmail's media upload, which takes messages up to 35 MB rather than
 * the much smaller JSON request limit.
 */
export async function uploadGmailDraftMessage(
  gmail: gmail_v1.Gmail,
  draft: { draftId?: string; threadId?: string | null },
  message: Buffer,
) {
  const { draftId, threadId } = draft;
  // The client's root URL isn't applied to upload URLs, so pass it per call.
  const options = { rootUrl: gmail.context._options.rootUrl };
  const result = await withGmailRetry(() => {
    // Built per attempt because a retry needs a fresh stream.
    const upload = {
      requestBody: { message: { threadId } },
      media: { mimeType: "message/rfc822", body: Readable.from(message) },
    };
    return draftId
      ? gmail.users.drafts.update(
          { userId: "me", id: draftId, ...upload },
          options,
        )
      : gmail.users.drafts.create({ userId: "me", ...upload }, options);
  });
  return result.data;
}

function draftMailOptions(
  current: GmailDraft,
  attachments: Mail.Attachment[],
  text?: DraftTextUpdate,
): Mail.Options {
  const html = text?.messageHtml ?? current.textHtml;
  return {
    from: current.headers?.from,
    to: text?.to ?? current.headers?.to ?? "",
    cc: text?.cc ?? current.headers?.cc,
    bcc: text?.bcc ?? current.headers?.bcc,
    replyTo: current.headers?.["reply-to"],
    subject: text?.subject ?? current.subject ?? "",
    // A plain-text draft stays plain text.
    ...(html == null
      ? { text: current.textPlain ?? "" }
      : { html, text: convertEmailHtmlToText({ htmlText: html }) }),
    attachments,
    inReplyTo: current.headers?.["in-reply-to"],
    references: current.headers?.references,
    headers: { "X-Mailer": "Inbox Zero Web" },
  };
}

async function getRequiredDraft(gmail: gmail_v1.Gmail, draftId: string) {
  const draft = await getDraft(draftId, gmail);
  if (!draft) throw draftNotFound();
  return draft;
}

function draftNotFound() {
  return new DraftNotFoundError(
    "This draft is no longer available in Gmail. Check Sent before trying again.",
  );
}
