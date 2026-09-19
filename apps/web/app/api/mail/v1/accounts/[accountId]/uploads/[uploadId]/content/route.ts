import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import {
  mailHttpErrorResponse,
  MAIL_PROTOCOL_VERSION,
} from "@inboxzero/mail-core/protocol/mail-http";
import {
  accountMismatchResponse,
  mailRequestId,
  protocolVersionFromRequest,
  unsupportedVersionResponse,
} from "@/utils/mail-api/authorization";
import { putAccountUploadContent } from "@/utils/mail-api/upload-blobs";

export const maxDuration = 300;

export const PUT = withEmailProvider(
  "mail/v1/uploads",
  async (request, context) => {
    try {
      const params = await context.params;
      const requestId = mailRequestId(request);
      const mismatch = accountMismatchResponse(
        request,
        params.accountId,
        requestId,
      );
      if (mismatch) return mismatch;
      const version = unsupportedVersionResponse(
        requestId,
        protocolVersionFromRequest(request),
      );
      if (version) return version;
      const result = await putAccountUploadContent(
        request.auth.emailAccountId,
        params.uploadId,
        bodyBytes(request),
      );
      if (result.status === "invalid") {
        return NextResponse.json(
          mailHttpErrorResponse({
            requestId,
            code: "invalid",
            retryable: false,
          }),
          { status: 400 },
        );
      }
      if (result.status === "missing") {
        return NextResponse.json(
          mailHttpErrorResponse({
            requestId,
            code: "not_found",
            retryable: false,
          }),
          { status: 404 },
        );
      }
      if (result.status === "unavailable") {
        return NextResponse.json(
          mailHttpErrorResponse({
            requestId,
            code: "unavailable",
            retryable: true,
          }),
          { status: 503 },
        );
      }
      if (result.status === "rejected") {
        const tooLarge = result.code === "too_large";
        return NextResponse.json(
          mailHttpErrorResponse({
            requestId,
            code: tooLarge ? "too_large" : "invalid",
            retryable: false,
          }),
          { status: tooLarge ? 507 : 400 },
        );
      }
      return NextResponse.json({
        protocolVersion: MAIL_PROTOCOL_VERSION,
        requestId,
        status: "staged",
        blobId: result.blobId,
        sizeBytes: result.sizeBytes,
        checksum: result.checksum,
      });
    } finally {
      await cancelUnreadBody(request);
    }
  },
);

async function cancelUnreadBody(request: Request) {
  if (!request.body || request.body.locked) return;
  await request.body.cancel().catch(() => undefined);
}

async function* bodyBytes(request: Request) {
  if (!request.body) return;
  const reader = request.body.getReader();
  const onAbort = () => {
    reader.cancel().catch(() => undefined);
  };
  request.signal.addEventListener("abort", onAbort, { once: true });
  try {
    while (!request.signal.aborted) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } catch {
    return;
  } finally {
    request.signal.removeEventListener("abort", onAbort);
    await reader.cancel().catch(() => undefined);
  }
}
