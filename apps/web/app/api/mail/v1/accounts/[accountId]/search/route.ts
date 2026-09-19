import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import {
  searchRequestSchema,
  searchResultSchema,
  mailHttpErrorResponse,
} from "@inboxzero/mail-core/protocol/mail-http";
import {
  accountMismatchResponse,
  mailRequestId,
  unsupportedVersionResponse,
} from "@/utils/mail-api/authorization";
import { createEmailProviderMailboxSource } from "@/utils/mail-api/source";

export const POST = withEmailProvider(
  "mail/v1/search",
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
    const parsed = searchRequestSchema.safeParse(body);
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
    const result = await source.search({
      ...parsed.data,
      signal: request.signal,
    });
    if ("status" in result && result.status === "unsupported") {
      return NextResponse.json(
        mailHttpErrorResponse({
          requestId,
          code: "unsupported",
          retryable: false,
        }),
        { status: 422 },
      );
    }
    if (result.status !== "ok")
      return NextResponse.json(result, { status: 503 });
    return NextResponse.json(
      searchResultSchema.parse({
        protocolVersion: parsed.data.protocolVersion,
        requestId,
        ...result.value,
      }),
    );
  },
);
