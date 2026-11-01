import { NextResponse } from "next/server";
import { z } from "zod";
import { mailHttpErrorResponse } from "@inboxzero/mail-core/protocol/mail-http";
import { SafeError } from "@/utils/error";
import {
  withEmailProvider,
  type RequestWithEmailProvider,
} from "@/utils/middleware";
import {
  accountMismatchResponse,
  bodyAccountMismatchResponse,
  mailRequestId,
  MAIL_PROTOCOL_VERSION,
  protocolVersionFromRequest,
  unsupportedVersionResponse,
} from "@/utils/mail-api/authorization";

export function withMailSplits(
  scope: string,
  handler: (
    request: RequestWithEmailProvider,
    params: Record<string, string>,
    body: unknown,
  ) => Promise<object>,
) {
  return withEmailProvider(scope, async (request, context) => {
    const params = await context.params;
    const requestId = mailRequestId(request);
    const mismatch = accountMismatchResponse(
      request,
      params.accountId,
      requestId,
    );
    if (mismatch) return mismatch;
    const queryVersion = unsupportedVersionResponse(
      requestId,
      protocolVersionFromRequest(request),
    );
    if (queryVersion) return queryVersion;

    try {
      let body: unknown;
      if (request.method === "POST" || request.method === "PATCH") {
        body = await request.json().catch(() => null);
        const envelope = z
          .object({ protocolVersion: z.unknown().optional() })
          .safeParse(body);
        if (envelope.success) {
          const version = unsupportedVersionResponse(
            requestId,
            envelope.data.protocolVersion,
          );
          if (version) return version;
        }
        const bodyMismatch = bodyAccountMismatchResponse(
          request.auth.emailAccountId,
          body,
          requestId,
        );
        if (bodyMismatch) return bodyMismatch;
      }
      const result = await handler(request, params, body);
      return NextResponse.json({
        protocolVersion: MAIL_PROTOCOL_VERSION,
        requestId,
        ...result,
      });
    } catch (error) {
      if (!(error instanceof z.ZodError || error instanceof SafeError))
        throw error;
      const result = mailHttpErrorResponse({
        requestId,
        code: "invalid",
        retryable: false,
      });
      return NextResponse.json(
        {
          ...result,
          error: {
            ...result.error,
            ...(error instanceof SafeError
              ? { message: error.safeMessage }
              : {}),
          },
        },
        { status: 400 },
      );
    }
  });
}
