import { Readable } from "node:stream";
import { decodeGmailAttachmentStream } from "./attachment-stream";
import type { Attachment } from "nodemailer/lib/mailer";
import type { gmail_v1 } from "@googleapis/gmail";
import { withGmailRetry } from "@/utils/gmail/retry";
import type { ParsedMessage } from "@/utils/types";

const embeddedPartPrefix = "gmail-part:";
const maximumEmbeddedBytes = 25_000_000;

export async function getGmailAttachment(
  gmail: gmail_v1.Gmail,
  messageId: string,
  attachmentId: string,
) {
  if (attachmentId.startsWith(embeddedPartPrefix)) {
    return readEmbeddedGmailAttachment(gmail, messageId, attachmentId);
  }
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
  if (attachmentId.startsWith(embeddedPartPrefix)) {
    const attachment = await readEmbeddedGmailAttachment(
      gmail,
      messageId,
      attachmentId,
      signal,
    );
    return new ReadableStream({
      start(controller) {
        signal?.throwIfAborted();
        controller.enqueue(Buffer.from(attachment.data, "base64url"));
        controller.close();
      },
    });
  }
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

export function getEmbeddedGmailAttachmentDescriptors(
  payload: gmail_v1.Schema$MessagePart | null | undefined,
): NonNullable<ParsedMessage["attachments"]> {
  if (!payload) return [];
  if (payload.parts?.length) {
    return payload.parts.flatMap(getEmbeddedGmailAttachmentDescriptors);
  }
  if (
    payload.partId == null ||
    payload.body?.data == null ||
    payload.body.attachmentId ||
    !payload.mimeType
  )
    return [];
  const headers = new Map(
    payload.headers?.map(({ name, value }) => [name?.toLowerCase(), value]),
  );
  const disposition = headers
    .get("content-disposition")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  const cid = headers.get("content-id");
  if (!cid && disposition !== "attachment") return [];
  const size = Buffer.byteLength(payload.body.data, "base64url");
  if (size > maximumEmbeddedBytes) return [];
  return [
    {
      attachmentId: embeddedPartPrefix + encodeURIComponent(payload.partId),
      filename: payload.filename ?? "",
      mimeType: payload.mimeType,
      size,
      headers: {
        "content-id": cid ?? "",
        "content-type": headers.get("content-type") ?? payload.mimeType,
        "content-disposition": headers.get("content-disposition") ?? "",
        "content-description": headers.get("content-description") ?? "",
        "content-transfer-encoding":
          headers.get("content-transfer-encoding") ?? "",
      },
    },
  ];
}

async function readEmbeddedGmailAttachment(
  gmail: gmail_v1.Gmail,
  messageId: string,
  attachmentId: string,
  signal?: AbortSignal,
) {
  let partId: string;
  try {
    partId = decodeURIComponent(attachmentId.slice(embeddedPartPrefix.length));
  } catch {
    throw Object.assign(new Error("Invalid Gmail MIME part reference"), {
      code: 404,
    });
  }
  const response = await withGmailRetry(() => {
    signal?.throwIfAborted();
    return gmail.users.messages.get(
      { userId: "me", id: messageId, format: "full" },
      { signal },
    );
  });
  signal?.throwIfAborted();
  const parts = response.data.payload ? [response.data.payload] : [];
  while (parts.length) {
    const part = parts.pop()!;
    if (
      part.partId === partId &&
      part.body?.data != null &&
      !part.body.attachmentId
    ) {
      const size = Buffer.byteLength(part.body.data, "base64url");
      if (size > maximumEmbeddedBytes)
        throw Object.assign(
          new Error("Embedded Gmail MIME part is too large"),
          { code: 413 },
        );
      return { data: part.body.data, size };
    }
    parts.push(...(part.parts ?? []));
  }
  throw Object.assign(new Error("Gmail MIME part no longer exists"), {
    code: 404,
  });
}
