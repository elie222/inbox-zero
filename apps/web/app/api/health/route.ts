import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { ExecutedRuleStatus } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("health");

export const dynamic = "force-dynamic";

const HEALTH_CHECK_WINDOW_MINUTES = 5;

export async function GET() {
  try {
    // Check for any executed rules in the last 5 minutes
    const cutoffTime = new Date(
      Date.now() - HEALTH_CHECK_WINDOW_MINUTES * 60 * 1000,
    );

    const recentActivity = await prisma.executedRule.findFirst({
      where: {
        createdAt: {
          gte: cutoffTime,
        },
        status: ExecutedRuleStatus.APPLIED,
      },
      select: {
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const isHealthy = !!recentActivity;
    const status = isHealthy ? 200 : 503;

    if (!isHealthy) {
      logger.error("Health check failed", { recentActivity });
    }

    return NextResponse.json(
      {
        status: isHealthy ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        lastActivityAt: recentActivity?.createdAt?.toISOString() || null,
      },
      { status },
    );
  } catch (error) {
    // If we can't query the database, the system is definitely unhealthy

    logger.error("Health check failed", { error });

    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: "Database connection failed",
      },
      { status: 503 },
    );
  }
}
