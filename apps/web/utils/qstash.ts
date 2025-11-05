import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import type { VerifySignatureConfig } from "@upstash/qstash/nextjs";
import { env } from "@/env";
import type { NextHandler } from "@/utils/middleware";

// Wrap QStash signature verification so it initializes at request time
// This avoids requiring signing keys during build/import.
export function verifyQstashAtRequestTime(handler: NextHandler): NextHandler {
  return async (request, context) => {
    const config: VerifySignatureConfig = {
      currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
    };
    const wrapped = verifySignatureAppRouter(async (r: Request) => {
      return handler(r as any, context);
    }, config);
    return wrapped(request as any);
  };
}
