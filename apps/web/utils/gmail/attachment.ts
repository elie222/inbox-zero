import { Readable } from "node:stream";
import { decodeGmailAttachmentStream } from "./attachment-stream";
import type { Attachment } from "nodemailer/lib/mailer";
import type { gmail_v1 } from "@googleapis/gmail";
import { withGmailRetry } from "@/utils/gmail/retry";

export async function getGmailAttachment(
  gmail: gmail_v1.Gmail,
  messageId: string,
  attachmentId: string,
) {
  const attachment = await withGmailRetry(() =>
    gmail.users.messages.attachments.get({
      userId: "me",
      id: attachmentId,
      messageId,
    }),
  );
  const attachmentData = attachment.data;
  return attachmentData;
}

export async function getGmailAttachmentStream(
  gmail: gmail_v1.Gmail,
  messageId: string,
  attachmentId: string,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const response = await withGmailRetry(() => {
    signal?.throwIfAborted();
    return gmail.users.messages.attachments.get(
      { userId: "me", id: attachmentId, messageId },
      { responseType: "stream", signal },
    );
  });
  if (signal?.aborted) {
    response.data.destroy();
    signal.throwIfAborted();
  }
  return decodeGmailAttachmentStream(
    // Node's web stream type is a separate declaration from the DOM one.
    Readable.toWeb(response.data) as unknown as ReadableStream<Uint8Array>,
    signal,
  );
}

export async function getGmailMessageAttachments(
  gmail: gmail_v1.Gmail,
  messageId: string,
  payload: gmail_v1.Schema$MessagePart | null | undefined,
): Promise<Attachment[]> {
  if (!payload) return [];
  if (payload.parts?.length) {
    const attachments = [];
    for (const part of payload.parts) {
      attachments.push(
        ...(await getGmailMessageAttachments(gmail, messageId, part)),
      );
    }
    return attachments;
  }

  const headers = new Map(
    payload.headers?.map(({ name, value }) => [name?.toLowerCase(), value]),
  );
  const disposition = headers
    .get("content-disposition")
    ?.split(";")[0]
    .trim()
    .toLowerCase();
  const contentId = headers.get("content-id");
  const isBody =
    payload.mimeType === "text/plain" || payload.mimeType === "text/html";
  if (isBody && !payload.filename && disposition !== "attachment") return [];
  if (!payload.mimeType || payload.mimeType.startsWith("multipart/")) return [];

  const data = payload.body?.attachmentId
    ? (await getGmailAttachment(gmail, messageId, payload.body.attachmentId))
        .data
    : payload.body?.data;
  if (data == null) throw new Error("Missing Gmail attachment data");

  return [
    {
      filename: payload.filename || undefined,
      contentType: payload.mimeType,
      content: Buffer.from(data, "base64url"),
      contentDisposition:
        disposition === "inline" || (!disposition && contentId)
          ? "inline"
          : "attachment",
      cid: contentId?.replace(/^<|>$/g, ""),
    },
  ];
}
