import {
  blobIdSchema,
  MAIL_PROTOCOL_VERSION,
} from "@inboxzero/mail-core/identities";
import { createMailHttpRequest } from "@/utils/mail-engine/http";
import type { Attachment } from "@/utils/types/mail";
import { randomUuid } from "@/utils/uuid";
import { admissionRejectionCopy } from "@/utils/mail-engine/admission-notice";

export async function stageSendAttachments(
  accountId: string,
  attachments: Attachment[] | undefined,
) {
  if (!attachments?.length) return [];
  const request = createMailHttpRequest(accountId);
  const ids: string[] = [];
  for (const attachment of attachments) {
    const bytes = decodeBase64(attachment.content);
    const checksum = await sha256Hex(bytes);
    const uploadId = blobIdSchema.safeParse(attachment.id).success
      ? attachment.id
      : randomUuid();
    const base = `/api/mail/v1/accounts/${encodeURIComponent(accountId)}/uploads`;
    const admitted = await request({
      method: "POST",
      path: base,
      body: {
        protocolVersion: MAIL_PROTOCOL_VERSION,
        requestId: randomUuid(),
        session: { accountId, generation: "local" },
        uploadId,
        sizeBytes: bytes.byteLength,
        checksum,
        contentType: attachment.contentType,
        filename: attachment.filename,
      },
      signal: AbortSignal.timeout(30_000),
    });
    const blobId =
      admitted.json &&
      typeof admitted.json === "object" &&
      "blobId" in admitted.json &&
      typeof admitted.json.blobId === "string"
        ? admitted.json.blobId
        : null;
    if (admitted.status >= 400 || !blobId) {
      throw new Error(
        admissionRejectionCopy(httpErrorCode(admitted.json)) ??
          `Could not stage ${attachment.filename} for sending.`,
      );
    }
    const staged = await request({
      method: "PUT",
      path: `${base}/${encodeURIComponent(blobId)}/content?protocolVersion=${MAIL_PROTOCOL_VERSION}`,
      body: bytes,
      signal: AbortSignal.timeout(30_000),
    });
    if (staged.status >= 400) {
      throw new Error(
        admissionRejectionCopy(httpErrorCode(staged.json)) ??
          `Could not stage ${attachment.filename} for sending.`,
      );
    }
    ids.push(blobId);
  }
  return ids;
}

function decodeBase64(value: string) {
  if (typeof Buffer !== "undefined") return Buffer.from(value, "base64");
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice());
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function httpErrorCode(json: unknown) {
  if (!json || typeof json !== "object" || !("error" in json)) return;
  const error = json.error;
  if (!error || typeof error !== "object" || !("code" in error)) return;
  return typeof error.code === "string" ? error.code : undefined;
}
