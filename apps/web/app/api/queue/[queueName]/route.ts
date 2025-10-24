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
import { getQueueHandler, isValidQueueName } from "@/utils/queue/queues";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { withError } from "@/utils/middleware";
import { isValidInternalApiKey } from "@/utils/internal-api";
import { env } from "@/env";

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

  // Validate queue name first
  if (!isValidQueueName(queueName)) {
    logger.warn("Unknown queue name", { queueName });
    return NextResponse.json({ error: "Unknown queue name" }, { status: 400 });
  }

  // For internal Redis/BullMQ requests, validate authentication
  if (env.QUEUE_SYSTEM === "redis") {
    const isAuthorized = await validateInternalRequest(request);
    if (!isAuthorized) {
      logger.error("Unauthorized internal request", { queueName });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await request.json();

  logger.info("Processing queue job", {
    queueName,
    queueSystem: env.QUEUE_SYSTEM,
  });

  // Get the appropriate handler
  const handler = getQueueHandler(queueName);
  if (!handler) {
    logger.error("No handler found for queue", { queueName });
    return NextResponse.json(
      { error: "No handler found for queue" },
      { status: 500 },
    );
  }

  // Execute the handler
  return await handler(body);
}

// Export with QStash signature verification for QStash requests
// and withError middleware for consistent error handling
export const POST = verifySignatureAppRouter(withError(handleQueueJob));
