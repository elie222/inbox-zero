import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";
import {
  summaryStatsQuerySchema,
  type SummaryStatsResponse,
} from "../validation";
import { validateApiKeyAndGetGmailClient } from "@/utils/api-auth";
import { getEmailAccountId } from "@/app/api/v1/helpers";
import { getStatsByPeriod } from "@/app/api/user/stats/by-period/controller";

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
    email: queryResult.data.email,
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
    const result: SummaryStatsResponse = await getStatsByPeriod({
      period: queryResult.data.period,
      fromDate: queryResult.data.fromDate,
      toDate: queryResult.data.toDate,
      emailAccountId,
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error("Error retrieving summary statistics", {
      userId,
      emailAccountId,
      error,
    });
    return NextResponse.json(
      { error: "Failed to retrieve summary statistics" },
      { status: 500 },
    );
  }
});
