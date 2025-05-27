import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";
import { dayStatsQuerySchema } from "../validation";
import { validateApiKeyAndGetGmailClient } from "@/utils/api-auth";
import { getEmailAccountId } from "@/app/api/v1/helpers";
import { getPastSevenDayStats } from "@/app/api/user/stats/day/controller";

const logger = createScopedLogger("api/v1/stats/day");

export const GET = withError(async (request) => {
  const { gmail, userId, accountId } =
    await validateApiKeyAndGetGmailClient(request);

  const { searchParams } = new URL(request.url);
  const queryResult = dayStatsQuerySchema.safeParse(
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
    const result = await getPastSevenDayStats({
      type: queryResult.data.type,
      gmail,
      emailAccountId,
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error("Error retrieving day statistics", {
      userId,
      emailAccountId,
      type: queryResult.data.type,
      error,
    });
    return NextResponse.json(
      { error: "Failed to retrieve day statistics" },
      { status: 500 },
    );
  }
});
