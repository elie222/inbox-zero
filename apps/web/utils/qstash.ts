import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { env } from "@/env";
import { isValidInternalApiKey } from "@/utils/internal-api";
import type { NextHandler, RequestWithLogger } from "@/utils/middleware";

export function withQstashOrInternal(
  handler: NextHandler<RequestWithLogger>,
): NextHandler<RequestWithLogger> {
  if (env.QSTASH_TOKEN) {
    return verifySignatureAppRouter(handler);
  }

  return async (request, context) => {
    if (!isValidInternalApiKey(request.headers, request.logger)) {
      return new Response("Unauthorized", { status: 401 });
    }

    return handler(request, context);
  };
}
