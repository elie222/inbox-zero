import {
  accountIdSchema,
  MAIL_PROTOCOL_VERSION,
} from "@inboxzero/mail-core/identities";
import { attachmentContentQuerySchema } from "@inboxzero/mail-core/protocol/mail-http";

const attachmentRequestSchema = attachmentContentQuerySchema.extend({
  accountId: accountIdSchema,
});
const MAX_INLINE_IMAGE_BYTES = 25 * 1024 * 1024;

export async function readDesktopAttachment(input: {
  payload: unknown;
  origin: string;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
}) {
  const { accountId, messageId, attachmentId } = attachmentRequestSchema.parse(
    input.payload,
  );
  const params = new URLSearchParams({
    messageId,
    attachmentId,
    protocolVersion: String(MAIL_PROTOCOL_VERSION),
  });
  const url = new URL(
    `/api/mail/v1/accounts/${encodeURIComponent(accountId)}/attachment-content?${params}`,
    input.origin,
  );
  const response = await input.fetch(url.toString(), {
    headers: { "X-Email-Account-ID": accountId },
    credentials: "include",
    signal: AbortSignal.timeout(30_000),
  });
  if (
    !response.ok ||
    Number(response.headers.get("content-length")) > MAX_INLINE_IMAGE_BYTES
  ) {
    await response.body?.cancel();
    throw new Error("Inline image download failed");
  }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_INLINE_IMAGE_BYTES)
        throw new Error("Inline image exceeds size limit");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
