import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { env } from "@/env";
import { isValidInternalApiKey } from "@/utils/internal-api";
import type { NextHandler, RequestWithLogger } from "@/utils/middleware";

export function withQstashOrInternal(
  handler: NextHandler<RequestWithLogger>,
): NextHandler<RequestWithLogger> {
  return async (request, context) => {
    if (env.QSTASH_TOKEN) {
      const verified = verifySignatureAppRouter(
        (req: Request, params?: { params?: Record<string, string> }) =>
          handler(req as RequestWithLogger, normalizeContext(params)),
      );
      return verified(request, context);
    }

    if (!isValidInternalApiKey(request.headers, request.logger)) {
      return new Response("Unauthorized", { status: 401 });
    }

    return handler(request, context);
  };
}

function normalizeContext(params?: { params?: Record<string, string> }) {
  return { params: Promise.resolve(params?.params ?? {}) };
}
