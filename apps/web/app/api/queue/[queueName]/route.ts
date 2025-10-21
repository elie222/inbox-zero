/**
 * Generic queue handler API route
 * This handles jobs from both QStash and BullMQ systems
 *
 * Usage: POST /api/queue/{queueName}
 * Body: Job data
 */

import { type NextRequest, NextResponse } from "next/server";
import { createScopedLogger } from "@/utils/logger";
import { getQueueHandler, isValidQueueName } from "@/utils/queue/queues";

const logger = createScopedLogger("queue-api");

export async function POST(
  request: NextRequest,
  { params }: { params: { queueName: string } },
) {
  const { queueName } = params;

  try {
    const body = await request.json();

    logger.info("Received queue job", {
      queueName,
      body: JSON.stringify(body),
    });

    // Validate queue name
    if (!isValidQueueName(queueName)) {
      logger.warn("Unknown queue name", { queueName });
      return NextResponse.json(
        { error: "Unknown queue name" },
        { status: 400 },
      );
    }

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
  } catch (error) {
    logger.error("Queue job processing failed", {
      queueName,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: "Job processing failed" },
      { status: 500 },
    );
  }
}
