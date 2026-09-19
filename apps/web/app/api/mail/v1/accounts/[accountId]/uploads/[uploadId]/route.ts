import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import {
  mailHttpErrorResponse,
  MAIL_PROTOCOL_VERSION,
} from "@inboxzero/mail-core/protocol/mail-http";
import {
  accountMismatchResponse,
  mailRequestId,
  unsupportedVersionResponse,
} from "@/utils/mail-api/authorization";
import {
  cancelAccountUpload,
  inspectAccountUpload,
} from "@/utils/mail-api/upload-blobs";

export const GET = withEmailProvider(
  "mail/v1/uploads",
  async (request, context) => {
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
    const inspected = await inspectAccountUpload(
      request.auth.emailAccountId,
      params.uploadId,
    );
    if (inspected.status === "invalid") {
      return NextResponse.json(
        mailHttpErrorResponse({ requestId, code: "invalid", retryable: false }),
        { status: 400 },
      );
    }
    if (inspected.status === "missing") {
      return NextResponse.json(
        mailHttpErrorResponse({
          requestId,
          code: "not_found",
          retryable: false,
        }),
        { status: 404 },
      );
    }
    return NextResponse.json({
      protocolVersion: MAIL_PROTOCOL_VERSION,
      requestId,
      status: "ready",
      blobId: inspected.blobId,
    });
  },
);

export const DELETE = withEmailProvider(
  "mail/v1/uploads",
  async (request, context) => {
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
    const cancelled = await cancelAccountUpload(
      request.auth.emailAccountId,
      params.uploadId,
    );
    if (cancelled.status === "invalid") {
      return NextResponse.json(
        mailHttpErrorResponse({ requestId, code: "invalid", retryable: false }),
        { status: 400 },
      );
    }
    return NextResponse.json({
      protocolVersion: MAIL_PROTOCOL_VERSION,
      requestId,
      status: "deleted",
      blobId: cancelled.blobId,
    });
  },
);

function protocolVersionFromRequest(request: { nextUrl: URL }) {
  const raw = request.nextUrl.searchParams.get("protocolVersion");
  if (raw == null || raw === "") return;
  const version = Number(raw);
  return Number.isFinite(version) ? version : raw;
}
