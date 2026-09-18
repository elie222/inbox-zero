import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import {
  MAIL_PROTOCOL_VERSION,
  mailHttpErrorResponse,
  operationAdmitRequestSchema,
  operationAdmitResultSchema,
  operationInspectRequestSchema,
} from "@inboxzero/mail-core/protocol/mail-http";
import {
  accountMismatchResponse,
  mailRequestId,
  unsupportedVersionResponse,
} from "@/utils/mail-api/authorization";
import { createEmailProviderOperationExecutor } from "@/utils/mail-api/operations";

export const PUT = withEmailProvider(
  "mail/v1/operations",
  async (request, context) => {
    const params = await context.params;
    const body = await request.json();
    const requestId = mailRequestId(request, body);
    const mismatch = accountMismatchResponse(
      request,
      params.accountId,
      requestId,
    );
    if (mismatch) return mismatch;
    const version = unsupportedVersionResponse(requestId, body.protocolVersion);
    if (version) return version;
    const parsed = operationAdmitRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        mailHttpErrorResponse({ requestId, code: "invalid", retryable: false }),
        { status: 400 },
      );
    }
    if (parsed.data.operation.key.operationId !== params.commandId) {
      return NextResponse.json(
        mailHttpErrorResponse({ requestId, code: "invalid", retryable: false }),
        { status: 400 },
      );
    }
    const executor = createEmailProviderOperationExecutor({
      provider: request.emailProvider,
      accountId: request.auth.emailAccountId,
    });
    const result = await executor.execute({
      operation: parsed.data.operation,
      attemptId: parsed.data.attemptId,
      signal: request.signal,
    });
    return NextResponse.json(
      operationAdmitResultSchema.parse({
        ...result,
        protocolVersion: parsed.data.protocolVersion,
        requestId,
      }),
    );
  },
);

export const GET = withEmailProvider(
  "mail/v1/operations/inspect",
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
    const parsed = operationInspectRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        operationAdmitResultSchema.parse({
          status: "uncertain",
          protocolVersion: MAIL_PROTOCOL_VERSION,
          requestId,
          receiptId: params.commandId,
        }),
      );
    }
    const executor = createEmailProviderOperationExecutor({
      provider: request.emailProvider,
      accountId: request.auth.emailAccountId,
    });
    const result = await executor.inspect({
      operation: parsed.data.operation,
      receiptId: parsed.data.receiptId,
      signal: request.signal,
    });
    return NextResponse.json(
      operationAdmitResultSchema.parse({
        ...result,
        protocolVersion: parsed.data.protocolVersion,
        requestId,
      }),
    );
  },
);
