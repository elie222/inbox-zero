import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { mailHttpErrorResponse } from "@inboxzero/mail-core/protocol/mail-http";
import {
  accountMismatchResponse,
  mailRequestId,
} from "@/utils/mail-api/authorization";

export const POST = withEmailProvider(
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
    return NextResponse.json(
      mailHttpErrorResponse({
        requestId,
        code: "unsupported",
        retryable: false,
      }),
      { status: 422 },
    );
  },
);
