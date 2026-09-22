import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import {
  mailHttpErrorResponse,
  MAIL_PROTOCOL_VERSION,
  uploadAdmitRequestSchema,
} from "@inboxzero/mail-core/protocol/mail-http";
import {
  accountMismatchResponse,
  bodyAccountMismatchResponse,
  mailRequestId,
  unsupportedVersionResponse,
} from "@/utils/mail-api/authorization";
import { admitAccountUpload } from "@/utils/mail-api/upload-blobs";

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
    const bodyMismatch = bodyAccountMismatchResponse(
      request.auth.emailAccountId,
      parsed.data,
      requestId,
    );
    if (bodyMismatch) return bodyMismatch;
    const admitted = await admitAccountUpload(request.auth.emailAccountId, {
      uploadId: parsed.data.uploadId,
      checksum: parsed.data.checksum,
      sizeBytes: parsed.data.sizeBytes,
      filename: parsed.data.filename ?? parsed.data.uploadId,
      contentType: parsed.data.contentType,
    });
    if (admitted.status === "invalid") {
      return NextResponse.json(
        mailHttpErrorResponse({ requestId, code: "invalid", retryable: false }),
        { status: 400 },
      );
    }
    return NextResponse.json({
      protocolVersion: MAIL_PROTOCOL_VERSION,
      requestId,
      status: "admitted",
      blobId: admitted.blobId,
    });
  },
);
