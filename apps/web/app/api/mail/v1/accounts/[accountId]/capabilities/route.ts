import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { capabilitiesResultSchema } from "@inboxzero/mail-core/protocol/mail-http";
import {
  accountMismatchResponse,
  mailRequestId,
  MAIL_PROTOCOL_VERSION,
  sourceFailureResponse,
} from "@/utils/mail-api/authorization";
import { createEmailProviderMailboxSource } from "@/utils/mail-api/source";

export const GET = withEmailProvider(
  "mail/v1/capabilities",
  async (request, context) => {
    const params = await context.params;
    const requestId = mailRequestId(request);
    const mismatch = accountMismatchResponse(
      request,
      params.accountId,
      requestId,
    );
    if (mismatch) return mismatch;
    const source = createEmailProviderMailboxSource({
      provider: request.emailProvider,
      accountId: request.auth.emailAccountId,
    });
    const described = await source.describe({
      session: {
        accountId: request.auth.emailAccountId,
        generation: request.auth.emailAccountId,
      },
      requestId,
      signal: request.signal,
    });
    if (described.status !== "ok") {
      return sourceFailureResponse(described, requestId);
    }
    return NextResponse.json(
      capabilitiesResultSchema.parse({
        protocolVersion: MAIL_PROTOCOL_VERSION,
        requestId,
        ...described.value,
      }),
    );
  },
);
