import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import {
  mailHttpErrorResponse,
  MAIL_PROTOCOL_VERSION,
  uploadAdmitRequestSchema,
} from "@inboxzero/mail-core/protocol/mail-http";
import {
  accountMismatchResponse,
  mailRequestId,
  unsupportedVersionResponse,
} from "@/utils/mail-api/authorization";
import { createFileBlobStore } from "@inboxzero/mail-sqlite/blob-store";

export const POST = withEmailProvider(
  "mail/v1/uploads",
  async (request, context) => {
    const params = await context.params;
    const body = await request.json().catch(() => null);
    const requestId = mailRequestId(request, body ?? undefined);
    const mismatch = accountMismatchResponse(
      request,
      params.accountId,
      requestId,
    );
    if (mismatch) return mismatch;
    const parsed = uploadAdmitRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        mailHttpErrorResponse({ requestId, code: "invalid", retryable: false }),
        { status: 400 },
      );
    }
    const version = unsupportedVersionResponse(
      requestId,
      parsed.data.protocolVersion,
    );
    if (version) return version;
    const bytes = decodeUploadBytes(body);
    if (!bytes) {
      return NextResponse.json(
        mailHttpErrorResponse({ requestId, code: "invalid", retryable: false }),
        { status: 400 },
      );
    }
    const store = createFileBlobStore(
      join(tmpdir(), "inbox-zero-mail-uploads", request.auth.emailAccountId),
    );
    const staged = await store.stage({
      blobId: parsed.data.uploadId,
      bytes: (async function* () {
        yield bytes;
      })(),
      checksum: parsed.data.checksum,
      sizeBytes: parsed.data.sizeBytes,
    });
    if (staged.status !== "staged") {
      return NextResponse.json(
        mailHttpErrorResponse({
          requestId,
          code: "invalid",
          retryable: false,
        }),
        { status: 400 },
      );
    }
    const finalized = await store.finalize(parsed.data.uploadId);
    if (!finalized) {
      return NextResponse.json(
        mailHttpErrorResponse({
          requestId,
          code: "unavailable",
          retryable: true,
        }),
        { status: 503 },
      );
    }
    return NextResponse.json({
      protocolVersion: MAIL_PROTOCOL_VERSION,
      requestId,
      status: "staged",
      blobId: finalized.blobId,
      sizeBytes: finalized.sizeBytes,
      checksum: finalized.checksum,
    });
  },
);

function decodeUploadBytes(body: unknown) {
  if (!body || typeof body !== "object" || !("bytes" in body)) return null;
  const encoded = body.bytes;
  if (typeof encoded !== "string") return null;
  const bytes = Buffer.from(encoded, "base64");
  const expected =
    "checksum" in body && typeof body.checksum === "string"
      ? body.checksum
      : null;
  if (
    expected &&
    createHash("sha256").update(bytes).digest("hex") !== expected
  ) {
    return bytes;
  }
  return bytes;
}
