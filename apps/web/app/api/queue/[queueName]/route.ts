/**
 * Generic queue handler API route
 * This handles jobs from both QStash and BullMQ systems
 *
 * Authentication:
 * - QStash requests: Verified via QStash signature
 * - Internal Redis/BullMQ requests: Verified via internal API key
 *
 * Usage: POST /api/queue/{queueName}
 * Body: Job data
 */

import { type NextRequest, NextResponse } from "next/server";
import { createScopedLogger } from "@/utils/logger";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { withError } from "@/utils/middleware";
import { isValidInternalApiKey } from "@/utils/internal-api";
import { env } from "@/env";
import { verifyWorkerSignatureAppRouter } from "@/utils/worker-signature";

const logger = createScopedLogger("queue-api");

// Internal authentication for Redis/BullMQ jobs
async function validateInternalRequest(request: NextRequest): Promise<boolean> {
  // Check for internal API key
  if (isValidInternalApiKey(request.headers, logger)) {
    return true;
  }

  // Check for cron secret (for scheduled jobs)
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${env.CRON_SECRET}`) {
    return true;
  }

  logger.warn("Unauthorized internal request", {
    hasInternalKey: !!request.headers.get("x-api-key"),
    hasCronSecret: !!authHeader,
    origin: request.headers.get("origin"),
    userAgent: request.headers.get("user-agent"),
  });

  return false;
}

// Main handler with authentication and error handling
async function handleQueueJob(
  request: NextRequest,
  { params }: { params: Promise<Record<string, string>> },
) {
  const { queueName } = await params;

  // For internal Redis/BullMQ requests, validate authentication
  if (env.QUEUE_SYSTEM === "redis") {
    const isAuthorized = await validateInternalRequest(request);
    if (!isAuthorized) {
      logger.error("Unauthorized internal request", { queueName });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  await request.json().catch(() => null);

  logger.info("Processing queue job", {
    queueName,
    queueSystem: env.QUEUE_SYSTEM,
  });

  // No centralized handling; acknowledge receipt only (legacy fallback)
  logger.info("Queue job acknowledged (no-op handler)", { queueName });
  return NextResponse.json({ success: true });
}

const queueRouteHandler = async (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> },
): Promise<NextResponse> => {
  // Internal Redis requests bypass QStash verification
  if (
    env.QUEUE_SYSTEM === "redis" &&
    (await validateInternalRequest(request))
  ) {
    // If worker signature headers are present and secret configured, verify HMAC
    if (
      request.headers.has("x-worker-signature") &&
      request.headers.has("x-worker-timestamp")
    ) {
      const response = await verifyWorkerSignatureAppRouter(
        async (req: Request): Promise<Response> => {
          const result = await handleQueueJob(req as NextRequest, context);
          return new Response(result.body, {
            status: result.status,
            statusText: result.statusText,
            headers: result.headers,
          });
        },
      )(request);

      return response instanceof NextResponse
        ? response
        : NextResponse.json(await response.json(), {
            status: response.status,
            headers: response.headers,
          });
    }
    return handleQueueJob(request, context);
  }

  // QStash requests: apply signature verification
  const response = await verifySignatureAppRouter(async (req: Request) => {
    const result = await handleQueueJob(req as NextRequest, context);
    return new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
      headers: result.headers,
    });
  })(request);

  return response instanceof NextResponse
    ? response
    : NextResponse.json(await response.json(), {
        status: response.status,
        headers: response.headers,
      });
};

export const POST = withError(queueRouteHandler);
