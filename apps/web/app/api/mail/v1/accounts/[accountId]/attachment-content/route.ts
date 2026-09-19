import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import {
  attachmentContentQuerySchema,
  mailHttpErrorResponse,
} from "@inboxzero/mail-core/protocol/mail-http";
import {
  accountMismatchResponse,
  mailRequestId,
  protocolVersionFromRequest,
  unsupportedVersionResponse,
} from "@/utils/mail-api/authorization";
import { createEmailProviderMailboxSource } from "@/utils/mail-api/source";

export const maxDuration = 300;

export const GET = withEmailProvider(
  "mail/v1/attachment-content",
  async (request, context) => {
    const params = await context.params;
    const requestId = mailRequestId(request);
    const mismatch = accountMismatchResponse(
      request,
      params.accountId,
      requestId,
    );
    if (mismatch) return mismatch;
    const version = unsupportedVersionResponse(
      requestId,
      protocolVersionFromRequest(request),
    );
    if (version) return version;
    const parsed = attachmentContentQuerySchema.safeParse({
      messageId: request.nextUrl.searchParams.get("messageId"),
      attachmentId: request.nextUrl.searchParams.get("attachmentId"),
    });
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
    const result = await source.readAttachment({
      session: {
        accountId: request.auth.emailAccountId,
        generation: request.auth.emailAccountId,
      },
      requestId,
      signal: request.signal,
      key: {
        accountId: request.auth.emailAccountId,
        messageId: parsed.data.messageId,
      },
      attachmentId: parsed.data.attachmentId,
    });
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
    if (result.status === "not_found") {
      return NextResponse.json(
        mailHttpErrorResponse({
          requestId,
          code: "not_found",
          retryable: false,
        }),
        { status: 404 },
      );
    }
    if (result.status !== "ok") {
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
    return new NextResponse(readableFrom(result.value.bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        ...(result.value.sizeBytes != null
          ? { "Content-Length": String(result.value.sizeBytes) }
          : {}),
      },
    });
  },
);

function readableFrom(bytes: AsyncIterable<Uint8Array>) {
  const iterator = bytes[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) {
        controller.close();
        return;
      }
      controller.enqueue(next.value);
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}
