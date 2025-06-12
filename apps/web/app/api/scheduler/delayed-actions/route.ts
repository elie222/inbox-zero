import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { withError } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";
import { isValidInternalApiKey } from "@/utils/internal-api";
import {
  processDelayedActions,
  getDelayedActionsStats,
} from "@/utils/scheduler/delayed-actions";

export const maxDuration = 300; // 5 minutes

const logger = createScopedLogger("api/scheduler/delayed-actions");

export const POST = withError(async () => {
  if (!isValidInternalApiKey(await headers(), logger)) {
    logger.error("Invalid API key");
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  logger.info("Processing delayed actions triggered");

  try {
    await processDelayedActions();
    const stats = await getDelayedActionsStats();

    return NextResponse.json({
      success: true,
      message: "Delayed actions processed successfully",
      stats,
    });
  } catch (error) {
    logger.error("Error processing delayed actions", { error });
    return NextResponse.json(
      { error: "Failed to process delayed actions" },
      { status: 500 },
    );
  }
});

export const GET = withError(async () => {
  if (!isValidInternalApiKey(await headers(), logger)) {
    logger.error("Invalid API key");
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  try {
    const stats = await getDelayedActionsStats();

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error) {
    logger.error("Error getting delayed actions stats", { error });
    return NextResponse.json({ error: "Failed to get stats" }, { status: 500 });
  }
});
