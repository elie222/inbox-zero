import {
  blobIdSchema,
  MAIL_PROTOCOL_VERSION,
} from "@inboxzero/mail-core/identities";
import { createMailHttpRequest } from "@/utils/mail-engine/http";
import type { Attachment } from "@/utils/types/mail";
import { randomUuid } from "@/utils/uuid";

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
    const response = await request({
      method: "POST",
      path: `/api/mail/v1/accounts/${encodeURIComponent(accountId)}/uploads`,
      body: {
        protocolVersion: MAIL_PROTOCOL_VERSION,
        requestId: randomUuid(),
        session: { accountId, generation: "local" },
        uploadId,
        sizeBytes: bytes.byteLength,
        checksum,
        contentType: attachment.contentType,
        filename: attachment.filename,
        bytes: attachment.content,
      },
      signal: AbortSignal.timeout(30_000),
    });
    const blobId =
      response.json &&
      typeof response.json === "object" &&
      "blobId" in response.json &&
      typeof response.json.blobId === "string"
        ? response.json.blobId
        : null;
    if (response.status >= 400 || !blobId) {
      throw new Error(`Could not stage ${attachment.filename} for sending.`);
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
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
