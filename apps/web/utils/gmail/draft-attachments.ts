import { randomBytes, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { gmail_v1 } from "@googleapis/gmail";
import type Mail from "nodemailer/lib/mailer";
import type { DraftAttachmentMetadata } from "@/utils/actions/draft-attachments.validation";
import type {
  DraftAttachment,
  DraftAttachmentsResult,
} from "@/utils/email/types";
import {
  type DraftMessageUploadPart,
  getDraftMessageUploadLength,
} from "@/utils/email/draft-attachment-upload";
import { DraftNotFoundError } from "@/utils/error";
import {
  embeddedGmailAttachmentId,
  getGmailAttachment,
} from "@/utils/gmail/attachment";
import { getDraft } from "@/utils/gmail/draft";
import { getGoogleGmailApiRootUrl } from "@/utils/gmail/oauth";
import { buildMailMessage } from "@/utils/gmail/mail";
import { withGmailRetry } from "@/utils/gmail/retry";
import { convertEmailHtmlToText } from "@/utils/mail";

type GmailDraft = NonNullable<Awaited<ReturnType<typeof getDraft>>>;

export type GmailDraftTextUpdate = {
  messageHtml?: string;
  subject?: string;
  to?: string;
  cc?: string;
  bcc?: string;
};

type NewAttachment = DraftAttachmentMetadata & { content: Buffer };

// Gmail and Gmail-compatible clients keep this part header across saves, which
// gives each attachment an id that survives Gmail replacing the message.
const ATTACHMENT_ID_HEADER = "X-Attachment-Id";

export async function getGmailDraftAttachments(
  gmail: gmail_v1.Gmail,
  draftId: string,
): Promise<DraftAttachmentsResult | null> {
  const draft = await getDraft(draftId, gmail);
  if (!draft) return null;
  return { messageId: draft.id, attachments: listGmailDraftAttachments(draft) };
}

export async function getRequiredGmailDraftAttachments(
  gmail: gmail_v1.Gmail,
  draftId: string,
) {
  const result = await getGmailDraftAttachments(gmail, draftId);
  if (!result)
    throw new DraftNotFoundError(
      "This draft is no longer available in Gmail. Check Sent before trying again.",
    );
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
  text?: GmailDraftTextUpdate;
  addAttachment?: NewAttachment;
  removeAttachmentId?: string;
}) {
  const current = await getRequiredDraft(gmail, draftId);
  const existing = listGmailDraftAttachmentParts(current).filter(
    ({ attachment }) =>
      attachment.id !== removeAttachmentId &&
      attachment.id !== addAttachment?.id,
  );
  const attachments: Mail.Attachment[] = [];
  for (const { attachment, data: inlineData } of existing) {
    const data =
      inlineData ??
      (
        await getGmailAttachment(
          gmail,
          attachment.messageId,
          attachment.providerAttachmentId,
        )
      ).data;
    if (data == null) throw new Error("Missing Gmail attachment data");
    attachments.push(
      toMailAttachment(attachment, Buffer.from(data, "base64url")),
    );
  }
  if (addAttachment)
    attachments.push(toMailAttachment(addAttachment, addAttachment.content));

  const message = await buildMailMessage(
    gmailDraftMailOptions(current, text, attachments),
  );
  await uploadGmailDraftMessage(
    gmail,
    { draftId, threadId: current.threadId },
    message,
    attachments.length > 0,
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
  const slots = [
    ...listGmailDraftAttachments(current)
      .filter((existing) => existing.id !== attachment.id)
      .map((existing) => ({
        attachment: existing,
        source: {
          messageId: existing.messageId,
          providerAttachmentId: existing.providerAttachmentId,
        },
      })),
    { attachment, source: undefined },
  ].map((slot) => {
    // A short placeholder whose base64 stands alone on one line, so it can be
    // found in the built message and swapped for the real file.
    const placeholder = randomBytes(15).toString("hex");
    return {
      ...slot,
      placeholder: Buffer.from(placeholder).toString("base64"),
      content: Buffer.from(placeholder),
    };
  });

  const built = await buildMailMessage(
    gmailDraftMailOptions(
      current,
      undefined,
      slots.map((slot) => toMailAttachment(slot.attachment, slot.content)),
    ),
  );
  // The browser re-encodes the text parts, so a byte outside ASCII would
  // change their length and break the declared upload size.
  if (built.some((byte) => byte > 0x7f))
    throw new Error("Could not prepare the draft upload.");
  const message = built.toString("latin1");

  // Inline images sit in a related part ahead of regular attachments, so the
  // message order can differ from the order the slots were passed in.
  const located = slots
    .map((slot) => ({ ...slot, index: message.indexOf(slot.placeholder) }))
    .sort((a, b) => a.index - b.index);
  const parts: DraftMessageUploadPart[] = [];
  let cursor = 0;
  for (const slot of located) {
    const { index } = slot;
    if (index < cursor) throw new Error("Could not prepare the draft upload.");
    parts.push({ type: "text", text: message.slice(cursor, index) });
    parts.push({
      type: "attachment",
      attachmentId: slot.attachment.id,
      size: slot.attachment.size,
      ...(slot.source ? { source: slot.source } : {}),
    });
    cursor = index + slot.placeholder.length;
  }
  parts.push({ type: "text", text: message.slice(cursor) });

  return {
    threadId: current.threadId,
    parts,
    totalBytes: getDraftMessageUploadLength(parts),
  };
}

export function listGmailDraftAttachments(
  draft: GmailDraft,
): DraftAttachment[] {
  return listGmailDraftAttachmentParts(draft).map(
    ({ attachment }) => attachment,
  );
}

export function gmailDraftMailOptions(
  current: GmailDraft,
  text: GmailDraftTextUpdate | undefined,
  attachments: Mail.Attachment[],
): Mail.Options {
  const html = text?.messageHtml ?? current.textHtml ?? "";
  return {
    from: current.headers?.from,
    to: text?.to ?? current.headers?.to ?? "",
    cc: text?.cc ?? current.headers?.cc,
    bcc: text?.bcc ?? current.headers?.bcc,
    replyTo: current.headers?.["reply-to"],
    subject: text?.subject ?? current.subject ?? "",
    text: convertEmailHtmlToText({ htmlText: html }),
    html,
    attachments,
    inReplyTo: current.headers?.["in-reply-to"],
    references: current.headers?.references,
    headers: { "X-Mailer": "Inbox Zero Web" },
  };
}

/**
 * Messages with files go through Gmail's media upload, which takes up to
 * 35 MB rather than the much smaller JSON request limit.
 */
export async function uploadGmailDraftMessage(
  gmail: gmail_v1.Gmail,
  draft: { draftId?: string; threadId?: string | null },
  message: Buffer,
  hasAttachments: boolean,
) {
  const { draftId, threadId } = draft;
  const result = await withGmailRetry(() => {
    if (!hasAttachments) {
      const requestBody = {
        message: { threadId, raw: message.toString("base64url") },
      };
      return draftId
        ? gmail.users.drafts.update({ userId: "me", id: draftId, requestBody })
        : gmail.users.drafts.create({ userId: "me", requestBody });
    }
    // Built per attempt because a retry needs a fresh stream. The client's
    // root URL isn't applied to upload URLs, so it is passed per call.
    const upload = {
      requestBody: { message: { threadId } },
      media: { mimeType: "message/rfc822", body: Readable.from(message) },
    };
    const options = { rootUrl: getGoogleGmailApiRootUrl() };
    return draftId
      ? gmail.users.drafts.update(
          { userId: "me", id: draftId, ...upload },
          options,
        )
      : gmail.users.drafts.create({ userId: "me", ...upload }, options);
  });
  return result.data;
}

function toMailAttachment(
  attachment: Pick<
    DraftAttachment,
    "id" | "filename" | "mimeType" | "disposition" | "contentId"
  >,
  content: Buffer,
): Mail.Attachment {
  const inline = attachment.disposition === "inline" && attachment.contentId;
  return {
    filename: attachment.filename,
    contentType: attachment.mimeType,
    content,
    contentTransferEncoding: "base64",
    contentDisposition: inline ? "inline" : "attachment",
    ...(inline ? { cid: attachment.contentId } : {}),
    headers: { [ATTACHMENT_ID_HEADER]: safeAttachmentId(attachment.id) },
  };
}

// Ids Gmail generated are long and not ours to put in a header; a fresh id is
// returned with the rebuilt draft instead.
function safeAttachmentId(id: string) {
  return /^[\w-]{1,64}$/u.test(id) ? id : randomUUID();
}

async function getRequiredDraft(gmail: gmail_v1.Gmail, draftId: string) {
  const draft = await getDraft(draftId, gmail);
  if (!draft)
    throw new DraftNotFoundError(
      "This draft is no longer available in Gmail. Check Sent before trying again.",
    );
  return draft;
}

function listGmailDraftAttachmentParts(draft: GmailDraft) {
  return collectAttachmentParts(draft.payload).map((part) => {
    const headers = partHeaders(part);
    const disposition = headers
      .get("content-disposition")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    const contentId = headers.get("content-id")?.trim().replace(/^<|>$/g, "");
    const providerAttachmentId =
      part.body?.attachmentId ?? embeddedGmailAttachmentId(part.partId ?? "");
    const attachment: DraftAttachment = {
      id:
        headers.get(ATTACHMENT_ID_HEADER.toLowerCase()) ?? providerAttachmentId,
      filename: part.filename || "attachment",
      mimeType: part.mimeType || "application/octet-stream",
      size:
        part.body?.size ??
        (part.body?.data ? Buffer.byteLength(part.body.data, "base64url") : 0),
      disposition:
        disposition === "inline" || (!disposition && contentId)
          ? "inline"
          : "attachment",
      ...(contentId ? { contentId } : {}),
      messageId: draft.id,
      providerAttachmentId,
    };
    // Small parts carry their bytes in the payload already.
    return {
      attachment,
      data: part.body?.attachmentId
        ? undefined
        : (part.body?.data ?? undefined),
    };
  });
}

function collectAttachmentParts(
  payload: gmail_v1.Schema$MessagePart | null | undefined,
): gmail_v1.Schema$MessagePart[] {
  if (!payload) return [];
  if (payload.parts?.length)
    return payload.parts.flatMap((part) => collectAttachmentParts(part));
  if (!payload.mimeType || payload.mimeType.startsWith("multipart/")) return [];
  const disposition = partHeaders(payload)
    .get("content-disposition")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  const isBody =
    payload.mimeType === "text/plain" || payload.mimeType === "text/html";
  if (isBody && !payload.filename && disposition !== "attachment") return [];
  return [payload];
}

function partHeaders(part: gmail_v1.Schema$MessagePart) {
  return new Map(
    (part.headers ?? []).map(({ name, value }) => [
      name?.toLowerCase(),
      value ?? undefined,
    ]),
  );
}
