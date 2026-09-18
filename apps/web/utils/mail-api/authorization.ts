import {
  MAIL_PROTOCOL_VERSION,
  mailHttpErrorResponse,
} from "@inboxzero/mail-core/protocol/mail-http";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { RequestWithEmailProvider } from "@/utils/middleware";

export function mailRequestId(
  request: NextRequest,
  body?: { requestId?: string },
) {
  return (
    body?.requestId ||
    request.nextUrl.searchParams.get("requestId") ||
    request.headers.get("x-request-id") ||
    crypto.randomUUID()
  );
}

export function accountMismatchResponse(
  request: RequestWithEmailProvider,
  accountId: string,
  requestId: string,
) {
  if (request.auth.emailAccountId === accountId) return null;
  return NextResponse.json(
    mailHttpErrorResponse({
      requestId,
      code: "forbidden",
      retryable: false,
    }),
    { status: 403 },
  );
}

export function unsupportedVersionResponse(
  requestId: string,
  version: unknown,
) {
  if (version === undefined || version === MAIL_PROTOCOL_VERSION) return null;
  return NextResponse.json(
    mailHttpErrorResponse({
      requestId,
      code: "unsupported_version",
      retryable: false,
    }),
    { status: 409 },
  );
}

export { MAIL_PROTOCOL_VERSION };
