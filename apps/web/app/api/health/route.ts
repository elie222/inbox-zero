import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { env } from "@/env";

export const GET = withError("health", async (request) => {
  const logger = request.logger;
  const healthApiKey = request.headers.get("x-health-api-key");
  const expectedKey = env.HEALTH_API_KEY;

  // If no API key header provided, return simple OK for ALB/load balancer health checks
  if (!healthApiKey) {
    return NextResponse.json({ status: "ok" });
  }

  // If API key header provided but doesn't match, reject
  if (expectedKey && healthApiKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Deep health check with valid API key
  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        status: "healthy",
        timestamp: new Date().toISOString(),
        database: {
          status: "healthy",
        },
      },
      { status: 200 },
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
});
