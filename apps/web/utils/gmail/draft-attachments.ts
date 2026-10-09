import { randomBytes, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { gmail_v1 } from "@googleapis/gmail";
import type Mail from "nodemailer/lib/mailer";
import type { DraftAttachmentMetadata } from "@/utils/actions/draft-attachments.validation";
import {
  assertDraftAttachmentLimits,
  type DraftMessageUploadPart,
  getDraftMessageUploadLength,
} from "@/utils/email/draft-attachment-upload";
import type {
  DraftAttachment,
  DraftAttachmentsResult,
} from "@/utils/email/types";
import { DraftNotFoundError } from "@/utils/error";
import {
  embeddedGmailAttachmentId,
  getGmailAttachment,
} from "@/utils/gmail/attachment";
import { getDraft } from "@/utils/gmail/draft";
import { buildMailMessage } from "@/utils/gmail/mail";
import { getGoogleGmailApiRootUrl } from "@/utils/gmail/oauth";
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

// Gmail keeps this part header across saves, which gives each attachment an
// id that survives Gmail replacing the draft's message.
const ATTACHMENT_ID_HEADER = "X-Attachment-Id";

export async function getGmailDraftAttachments(
  gmail: gmail_v1.Gmail,
  draftId: string,
): Promise<DraftAttachmentsResult | null> {
  const draft = await getDraft(draftId, gmail);
  if (!draft) return null;
  return {
    messageId: draft.id,
    attachments: listAttachmentParts(draft).map(({ attachment }) => attachment),
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
  const existing = listAttachmentParts(current).filter(
    ({ attachment }) =>
      attachment.id !== removeAttachmentId &&
      attachment.id !== addAttachment?.id,
  );
  if (addAttachment)
    assertDraftAttachmentLimits(
      existing.map(({ attachment }) => attachment),
      addAttachment.size,
    );
  const attachments: Mail.Attachment[] = [];
  for (const { attachment, data } of existing) {
    const content =
      data ??
      (
        await getGmailAttachment(
          gmail,
          attachment.messageId,
          attachment.providerAttachmentId,
        )
      ).data;
    if (content == null) throw new Error("Missing Gmail attachment data");
    attachments.push(
      toMailAttachment(attachment, Buffer.from(content, "base64url")),
    );
  }
  if (addAttachment)
    attachments.push(toMailAttachment(addAttachment, addAttachment.content));

  const message = await buildMailMessage(
    draftMailOptions(current, attachments, text),
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
  const existing = listAttachmentParts(current)
    .map((part) => part.attachment)
    .filter((item) => item.id !== attachment.id);
  assertDraftAttachmentLimits(existing, attachment.size);

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
      slots.map((slot) => toMailAttachment(slot.attachment, slot.content)),
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

function draftMailOptions(
  current: GmailDraft,
  attachments: Mail.Attachment[],
  text?: DraftTextUpdate,
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

function toMailAttachment(
  attachment: Pick<
    DraftAttachment,
    "id" | "filename" | "mimeType" | "disposition" | "contentId"
  >,
  content: Buffer,
): Mail.Attachment {
  const inline = attachment.disposition === "inline" && attachment.contentId;
  // Gmail's own attachment ids are long and unsafe as header values, so
  // those files get a fresh id that the rebuilt draft reports back.
  const id = /^[\w-]{1,64}$/u.test(attachment.id)
    ? attachment.id
    : randomUUID();
  return {
    filename: attachment.filename,
    contentType: attachment.mimeType,
    content,
    contentTransferEncoding: "base64",
    contentDisposition: inline ? "inline" : "attachment",
    ...(inline ? { cid: attachment.contentId } : {}),
    headers: { [ATTACHMENT_ID_HEADER]: id },
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

/** The draft's files, with the bytes of parts small enough to be inline. */
function listAttachmentParts(draft: GmailDraft) {
  return collectAttachmentParts(draft.payload).map((part) => {
    const headers = partHeaders(part);
    const contentId = headers.get("content-id")?.trim().replace(/^<|>$/g, "");
    const disposition = partDisposition(part);
    const providerAttachmentId =
      part.body?.attachmentId ?? embeddedGmailAttachmentId(part.partId ?? "");
    const data = part.body?.attachmentId
      ? undefined
      : (part.body?.data ?? undefined);
    const attachment: DraftAttachment = {
      id:
        headers.get(ATTACHMENT_ID_HEADER.toLowerCase()) ?? providerAttachmentId,
      filename: part.filename || "attachment",
      mimeType: part.mimeType || "application/octet-stream",
      size:
        part.body?.size ?? (data ? Buffer.byteLength(data, "base64url") : 0),
      disposition:
        disposition === "inline" || (!disposition && contentId)
          ? "inline"
          : "attachment",
      ...(contentId ? { contentId } : {}),
      messageId: draft.id,
      providerAttachmentId,
    };
    return { attachment, data };
  });
}

function collectAttachmentParts(
  payload: gmail_v1.Schema$MessagePart | null | undefined,
): gmail_v1.Schema$MessagePart[] {
  if (!payload) return [];
  // An attached email is one file, not a set of parts to unpack.
  if (payload.mimeType === "message/rfc822") return [payload];
  if (payload.parts?.length)
    return payload.parts.flatMap(collectAttachmentParts);
  if (!payload.mimeType || payload.mimeType.startsWith("multipart/")) return [];
  const isBody =
    payload.mimeType === "text/plain" || payload.mimeType === "text/html";
  if (isBody && !payload.filename && partDisposition(payload) !== "attachment")
    return [];
  return [payload];
}

function partDisposition(part: gmail_v1.Schema$MessagePart) {
  return partHeaders(part)
    .get("content-disposition")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
}

function partHeaders(part: gmail_v1.Schema$MessagePart) {
  return new Map(
    (part.headers ?? []).map(({ name, value }) => [
      name?.toLowerCase(),
      value ?? undefined,
    ]),
  );
}
