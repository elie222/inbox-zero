import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import {
  mailHttpErrorResponse,
  MAIL_PROTOCOL_VERSION,
  uploadHoldRequestSchema,
} from "@inboxzero/mail-core/protocol/mail-http";
import {
  accountMismatchResponse,
  bodyAccountMismatchResponse,
  mailRequestId,
  protocolVersionFromRequest,
  unsupportedVersionResponse,
} from "@/utils/mail-api/authorization";
import {
  cancelAccountUpload,
  inspectAccountUpload,
  setAccountUploadHold,
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
    const parsed = uploadHoldRequestSchema.safeParse(body);
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
    const bodyMismatch = bodyAccountMismatchResponse(
      request.auth.emailAccountId,
      parsed.data,
      requestId,
    );
    if (bodyMismatch) return bodyMismatch;
    const updated = await setAccountUploadHold(
      request.auth.emailAccountId,
      params.uploadId,
      parsed.data.held,
    );
    if (updated.status === "invalid") {
      return NextResponse.json(
        mailHttpErrorResponse({ requestId, code: "invalid", retryable: false }),
        { status: 400 },
      );
    }
    if (updated.status === "missing") {
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
      status: updated.status,
      blobId: updated.blobId,
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
    if (cancelled.status === "in_use") {
      return NextResponse.json(
        mailHttpErrorResponse({ requestId, code: "invalid", retryable: false }),
        { status: 409 },
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
