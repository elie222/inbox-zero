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
import {
  createFileBlobStore,
  writeBlobMetadata,
} from "@inboxzero/mail-sqlite/blob-store";
import {
  accountMailUploadDirectory,
  collectStaleMailUploads,
} from "@/utils/mail-api/upload-blobs";

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
    const directory = accountMailUploadDirectory(request.auth.emailAccountId);
    const store = createFileBlobStore(directory);
    try {
      const staged = await store.stage({
        blobId: parsed.data.uploadId,
        bytes: (async function* () {
          yield bytes;
        })(),
        checksum: parsed.data.checksum,
        sizeBytes: parsed.data.sizeBytes,
      });
      if (staged.status !== "staged") {
        const tooLarge = staged.code === "too_large";
        return NextResponse.json(
          mailHttpErrorResponse({
            requestId,
            code: tooLarge ? "too_large" : "invalid",
            retryable: false,
          }),
          { status: tooLarge ? 507 : 400 },
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
      await writeBlobMetadata(directory, finalized.blobId, {
        filename: parsed.data.filename ?? parsed.data.uploadId,
        contentType: parsed.data.contentType,
      });
      await collectStaleMailUploads({
        accountId: request.auth.emailAccountId,
        keepIds: [finalized.blobId],
      }).catch(() => undefined);
      return NextResponse.json({
        protocolVersion: MAIL_PROTOCOL_VERSION,
        requestId,
        status: "staged",
        blobId: finalized.blobId,
        sizeBytes: finalized.sizeBytes,
        checksum: finalized.checksum,
      });
    } catch (error) {
      const diskFull = isDiskFullError(error);
      return NextResponse.json(
        mailHttpErrorResponse({
          requestId,
          code: diskFull ? "too_large" : "invalid",
          retryable: false,
        }),
        { status: diskFull ? 507 : 400 },
      );
    }
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
    return null;
  }
  return bytes;
}

function isDiskFullError(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return error.code === "ENOSPC" || error.code === "EDQUOT";
}
