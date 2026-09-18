import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { assistantStateResultSchema } from "@inboxzero/mail-core/protocol/mail-http";
import {
  accountMismatchResponse,
  mailRequestId,
  MAIL_PROTOCOL_VERSION,
} from "@/utils/mail-api/authorization";
import { readAssistantStatePage } from "@/utils/mail-api/assistant-state";

export const GET = withEmailProvider(
  "mail/v1/assistant-state",
  async (request, context) => {
    const params = await context.params;
    const requestId = mailRequestId(request);
    const mismatch = accountMismatchResponse(
      request,
      params.accountId,
      requestId,
    );
    if (mismatch) return mismatch;
    const page = await readAssistantStatePage({
      emailAccountId: request.auth.emailAccountId,
      cursor: request.nextUrl.searchParams.get("cursor"),
    });
    return NextResponse.json(
      assistantStateResultSchema.parse({
        protocolVersion: MAIL_PROTOCOL_VERSION,
        requestId,
        cursor: page.cursor,
        nextCursor: page.nextCursor,
        reset: page.reset,
        entries: page.entries,
      }),
    );
  },
);
