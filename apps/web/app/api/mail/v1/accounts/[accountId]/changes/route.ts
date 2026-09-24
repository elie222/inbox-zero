import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import {
  changesRequestSchema,
  changesResultSchema,
  mailHttpErrorResponse,
} from "@inboxzero/mail-core/protocol/mail-http";
import {
  accountMismatchResponse,
  bodyAccountMismatchResponse,
  mailRequestId,
  unsupportedVersionResponse,
} from "@/utils/mail-api/authorization";
import { createEmailProviderMailboxSource } from "@/utils/mail-api/source";

export const POST = withEmailProvider(
  "mail/v1/changes",
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
    const parsed = changesRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        mailHttpErrorResponse({ requestId, code: "invalid", retryable: false }),
        { status: 400 },
      );
    }
    const bodyMismatch = bodyAccountMismatchResponse(
      request.auth.emailAccountId,
      parsed.data,
      requestId,
    );
    if (bodyMismatch) return bodyMismatch;
    const source = createEmailProviderMailboxSource({
      provider: request.emailProvider,
      accountId: request.auth.emailAccountId,
    });
    const result = await source.readChanges({
      ...parsed.data,
      signal: request.signal,
    });
    return NextResponse.json(
      changesResultSchema.parse({
        ...result,
        protocolVersion: parsed.data.protocolVersion,
        requestId,
      }),
    );
  },
);
