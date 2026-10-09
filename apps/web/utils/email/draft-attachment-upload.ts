import { EMAIL_ATTACHMENT_LIMITS } from "@inboxzero/email-editor/core";
import { SafeError } from "@/utils/error";

/**
 * Shared by the browser and the server: how composer attachments travel to a
 * mailbox draft without either side keeping the bytes.
 *
 * Every request to our server must stay under the 4.5 MB function payload cap,
 * so files at or above the direct limit go through a provider upload session.
 */
export const DRAFT_ATTACHMENT_DIRECT_UPLOAD_LIMIT_BYTES = 3 * 1024 * 1024;

const GMAIL_UPLOAD_GRANULARITY_BYTES = 256 * 1024;
export const GMAIL_UPLOAD_CHUNK_BYTES = 16 * GMAIL_UPLOAD_GRANULARITY_BYTES;

// Graph takes each upload session range under 4 MB.
export const GRAPH_UPLOAD_CHUNK_BYTES = 10 * 320 * 1024;

const MIME_BASE64_LINE_LENGTH = 76;
const MIME_LINE_BREAK = "\r\n";

export type DraftMessageUploadPart =
  | { type: "text"; text: string }
  | {
      type: "attachment";
      attachmentId: string;
      size: number;
      /** Where to read an attachment the draft already holds. */
      source?: { messageId: string; providerAttachmentId: string };
    };

/** The composer's file count and total size limits, enforced on the draft. */
export function assertDraftAttachmentLimits(
  existing: { size: number }[],
  size: number,
) {
  const totalBytes = existing.reduce((total, file) => total + file.size, size);
  if (existing.length + 1 > EMAIL_ATTACHMENT_LIMITS.maxFiles)
    throw new SafeError(
      `Attach at most ${EMAIL_ATTACHMENT_LIMITS.maxFiles} files.`,
    );
  if (totalBytes > EMAIL_ATTACHMENT_LIMITS.maxTotalBytes)
    throw new SafeError("Attachments must total 15 MB or less.");
}

export function usesDirectDraftAttachmentUpload(size: number) {
  return size < DRAFT_ATTACHMENT_DIRECT_UPLOAD_LIMIT_BYTES;
}

/** The length of `byteLength` bytes as MIME base64 with CRLF-wrapped lines. */
export function mimeBase64Length(byteLength: number) {
  const encodedLength = Math.ceil(byteLength / 3) * 4;
  if (encodedLength === 0) return 0;
  const lineBreaks = Math.ceil(encodedLength / MIME_BASE64_LINE_LENGTH) - 1;
  return encodedLength + lineBreaks * MIME_LINE_BREAK.length;
}

export function encodeMimeBase64(bytes: Uint8Array) {
  const lines: string[] = [];
  const bytesPerLine = (MIME_BASE64_LINE_LENGTH / 4) * 3;
  for (let offset = 0; offset < bytes.length; offset += bytesPerLine) {
    lines.push(encodeBase64(bytes.subarray(offset, offset + bytesPerLine)));
  }
  return lines.join(MIME_LINE_BREAK);
}

export function getDraftMessageUploadLength(parts: DraftMessageUploadPart[]) {
  return parts.reduce(
    (total, part) =>
      total +
      (part.type === "text" ? part.text.length : mimeBase64Length(part.size)),
    0,
  );
}

/**
 * Gmail accepts resumable chunks in 256 KiB multiples (except the last), and
 * each one passes through our server, so it must also fit one request.
 */
export function validateGmailUploadChunk({
  start,
  length,
  totalBytes,
  expectedStart,
}: {
  start: number;
  length: number;
  totalBytes: number;
  expectedStart: number;
}): { valid: true } | { valid: false; error: string } {
  if (start !== expectedStart)
    return { valid: false, error: "Upload chunk is out of order." };
  if (length <= 0 || length > GMAIL_UPLOAD_CHUNK_BYTES)
    return { valid: false, error: "Upload chunk size is invalid." };
  const end = start + length;
  if (end > totalBytes)
    return { valid: false, error: "Upload chunk runs past the message." };
  if (end < totalBytes && length % GMAIL_UPLOAD_GRANULARITY_BYTES !== 0)
    return { valid: false, error: "Upload chunk size is invalid." };
  return { valid: true };
}

export function parseContentRange(header: string | null) {
  const match = header?.match(/^bytes (\d+)-(\d+)\/(\d+)$/u);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = Number(match[3]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    !Number.isSafeInteger(total) ||
    end < start
  )
    return null;
  return { start, length: end - start + 1, total };
}

function encodeBase64(bytes: Uint8Array) {
  if (typeof Buffer !== "undefined")
    return Buffer.from(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).toString("base64");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
