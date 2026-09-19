import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import {
  enumerationRequestSchema,
  enumerationResultSchema,
  mailHttpErrorResponse,
} from "@inboxzero/mail-core/protocol/mail-http";
import {
  accountMismatchResponse,
  mailRequestId,
  unsupportedVersionResponse,
} from "@/utils/mail-api/authorization";
import { createEmailProviderMailboxSource } from "@/utils/mail-api/source";

export const POST = withEmailProvider(
  "mail/v1/enumeration",
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
    const parsed = enumerationRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        mailHttpErrorResponse({ requestId, code: "invalid", retryable: false }),
        { status: 400 },
      );
    }
    const source = createEmailProviderMailboxSource({
      provider: request.emailProvider,
      accountId: request.auth.emailAccountId,
    });
    const result = await source.enumerate({
      ...parsed.data,
      signal: request.signal,
    });
    if (result.status === "reset_required") {
      return NextResponse.json(result, { status: 409 });
    }
    if (result.status !== "ok") {
      return NextResponse.json(result, { status: 503 });
    }
    return NextResponse.json(
      enumerationResultSchema.parse({
        protocolVersion: parsed.data.protocolVersion,
        requestId,
        bootstrapId: result.value.bootstrapId,
        scopeId: result.value.scopeId,
        changes: result.value.changes,
        requiredHydration: result.value.requiredHydration,
        bodies: result.value.bodies,
        nextPage: result.value.nextPage,
        catchUpFrom: result.value.catchUpFrom,
      }),
    );
  },
);
