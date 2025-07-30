import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";
import {
  summaryStatsQuerySchema,
  type SummaryStatsResponse,
} from "../validation";
import { validateApiKeyAndGetGmailClient } from "@/utils/api-auth";
import { getEmailAccountId } from "@/app/api/v1/helpers";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("api/v1/stats/summary");

export const GET = withError(async (request) => {
  const { userId, accountId } = await validateApiKeyAndGetGmailClient(request);

  const { searchParams } = new URL(request.url);
  const queryResult = summaryStatsQuerySchema.safeParse(
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
    const { fromDate, toDate } = queryResult.data;

    // Build date conditions
    const dateConditions: any = { emailAccountId };
    if (fromDate) {
      dateConditions.date = { ...dateConditions.date, gte: new Date(fromDate) };
    }
    if (toDate) {
      dateConditions.date = { ...dateConditions.date, lte: new Date(toDate) };
    }

    // Get aggregated stats
    const stats = await prisma.emailStat.aggregate({
      where: dateConditions,
      _sum: {
        inboxCount: true,
        readCount: true,
        sentCount: true,
        totalCount: true,
      },
    });

    const response: SummaryStatsResponse = {
      received: stats._sum.totalCount || 0,
      read: stats._sum.readCount || 0,
      archived: (stats._sum.totalCount || 0) - (stats._sum.inboxCount || 0),
      sent: stats._sum.sentCount || 0,
    };

    logger.info("Retrieved summary stats", {
      userId,
      emailAccountId,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Error retrieving summary stats", {
      userId,
      error,
    });
    return NextResponse.json(
      { error: "Failed to retrieve stats" },
      { status: 500 },
    );
  }
});