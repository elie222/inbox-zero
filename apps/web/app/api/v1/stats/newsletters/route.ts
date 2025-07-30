import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";
import {
  newsletterStatsQuerySchema,
  type NewsletterStatsResponse,
} from "../validation";
import { validateApiKeyAndGetGmailClient } from "@/utils/api-auth";
import { getEmailAccountId } from "@/app/api/v1/helpers";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("api/v1/stats/newsletters");

export const GET = withError(async (request) => {
  const { userId, accountId, accessToken } = await validateApiKeyAndGetGmailClient(request);

  const { searchParams } = new URL(request.url);
  const queryResult = newsletterStatsQuerySchema.safeParse(
    Object.fromEntries(searchParams),
  );

  if (!queryResult.success) {
    return NextResponse.json(
      { error: "Invalid query parameters" },
      { status: 400 },
    );
  }

  const emailAccountId = await getEmailAccountId({
    accountId,
    userId,
  });

  if (!emailAccountId) {
    return NextResponse.json(
      { error: "Email account not found" },
      { status: 400 },
    );
  }

  try {
    const { fromDate, toDate, limit = "50", orderBy = "count" } = queryResult.data;

    // Build date conditions
    const dateConditions: any = {};
    if (fromDate) {
      dateConditions.createdAt = { ...dateConditions.createdAt, gte: new Date(fromDate) };
    }
    if (toDate) {
      dateConditions.createdAt = { ...dateConditions.createdAt, lte: new Date(toDate) };
    }

    // Determine order by clause
    const orderByClause = orderBy === "lastReceived" 
      ? { createdAt: "desc" as const }
      : orderBy === "firstReceived"
      ? { createdAt: "asc" as const }
      : { count: "desc" as const };

    // Get newsletter stats from database
    const newsletters = await prisma.newsletter.findMany({
      where: {
        email: emailAccountId,
        ...dateConditions,
      },
      select: {
        email: true,
        name: true,
        count: true,
        createdAt: true,
        updatedAt: true,
        readPercentage: true,
        status: true,
      },
      orderBy: orderByClause,
      take: parseInt(limit, 10),
    });

    const response: NewsletterStatsResponse = {
      newsletters: newsletters.map((newsletter) => ({
        name: newsletter.name || "Unknown",
        from: newsletter.email,
        count: newsletter.count,
        lastReceived: newsletter.updatedAt.toISOString(),
        readPercentage: newsletter.readPercentage || 0,
        hasUnsubscribeLink: newsletter.status === "UNSUBSCRIBED",
      })),
      total: newsletters.length,
    };

    logger.info("Retrieved newsletter stats", {
      userId,
      emailAccountId,
      count: response.total,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error retrieving newsletter stats", {
      userId,
      error,
    });
    return NextResponse.json(
      { error: "Failed to retrieve newsletter stats" },
      { status: 500 },
    );
  }
});