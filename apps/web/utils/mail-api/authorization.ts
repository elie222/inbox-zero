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

export function bodyAccountMismatchResponse(
  accountId: string,
  body: unknown,
  requestId: string,
) {
  if (!hasMismatchedAccountId(body, accountId)) return null;
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

export function sourceFailureResponse(
  result:
    | { status: "blocked_auth" }
    | {
        status: "paused";
        reason: "throttled" | "unavailable";
        retryAfterMs: number;
      },
  requestId: string,
) {
  if (result.status === "blocked_auth") {
    return NextResponse.json(
      mailHttpErrorResponse({
        requestId,
        code: "blocked_auth",
        retryable: true,
      }),
      { status: 401 },
    );
  }
  return NextResponse.json(
    mailHttpErrorResponse({
      requestId,
      code: result.reason === "throttled" ? "throttled" : "unavailable",
      retryable: true,
      retryAfterMs: result.retryAfterMs,
    }),
    { status: 503 },
  );
}

export function protocolVersionFromRequest(request: { nextUrl: URL }) {
  const raw = request.nextUrl.searchParams.get("protocolVersion");
  if (raw == null || raw === "") return;
  const version = Number(raw);
  return Number.isFinite(version) ? version : raw;
}

function hasMismatchedAccountId(value: unknown, accountId: string): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    return value.some((item) => hasMismatchedAccountId(item, accountId));
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "accountId" && typeof child === "string") {
      if (child !== accountId) return true;
      continue;
    }
    if (hasMismatchedAccountId(child, accountId)) return true;
  }
  return false;
}

export { MAIL_PROTOCOL_VERSION };
