import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import type { NextRequest } from "next/server";

const logger = createScopedLogger("worker-verify");

function buildExpectedSignature(
  timestamp: string,
  body: string,
  secret: string,
): string {
  const payload = `${timestamp}.${body}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function isFresh(timestampHeader: string, toleranceSeconds = 300): boolean {
  const ts = Date.parse(timestampHeader);
  if (Number.isNaN(ts)) return false;
  const now = Date.now();
  return Math.abs(now - ts) <= toleranceSeconds * 1000;
}

export function verifyWorkerSignatureAppRouter(
  handler: (req: Request) => Promise<Response> | Response,
) {
  return async (req: NextRequest): Promise<Response> => {
    const signature = req.headers.get("x-worker-signature") || "";
    const timestamp = req.headers.get("x-worker-timestamp") || "";
    const secret = env.WORKER_SIGNING_SECRET;

    if (!secret) {
      logger.warn("Missing WORKER_SIGNING_SECRET; rejecting signed request");
      return new Response(
        JSON.stringify({ error: "Signature verification not configured" }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        },
      );
    }

    // Basic freshness check (default 5 minutes)
    if (!isFresh(timestamp)) {
      logger.warn("Stale or invalid timestamp on worker request", {
        timestamp,
      });
      return new Response(JSON.stringify({ error: "Invalid timestamp" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    // Use clone to avoid consuming the original body
    const rawBody = await req.clone().text();
    const expected = buildExpectedSignature(timestamp, rawBody, secret);

    // Constant-time compare when lengths match
    const ok =
      signature.length === expected.length &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected));

    if (!ok) {
      logger.warn("Worker signature mismatch");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    return handler(req);
  };
}
