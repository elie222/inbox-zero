import { NextResponse } from "next/server";
import { withStatsApiKey } from "@/utils/api-middleware";
import { resolveStatsEmailAccountId } from "@/app/api/v1/helpers";
import { getStatsByPeriod } from "@/app/api/user/stats/by-period/controller";
import { statsByPeriodQuerySchema } from "./validation";

export const GET = withStatsApiKey("v1/stats/by-period", async (request) => {
  const {
    userId,
    accountId,
    emailAccountId: scopedEmailAccountId,
    authType,
  } = request.apiAuth;
  const { searchParams } = new URL(request.url);
  const queryResult = statsByPeriodQuerySchema.safeParse(
    Object.fromEntries(searchParams),
  );

  if (!queryResult.success) {
    return NextResponse.json(
      { error: "Invalid query parameters" },
      { status: 400 },
    );
  }

  const { period, fromDate, toDate, email } = queryResult.data;

  const emailAccountId = await resolveStatsEmailAccountId({
    authType,
    scopedEmailAccountId,
    email,
    accountId,
    userId,
  });

  if (!emailAccountId) {
    return NextResponse.json(
      { error: "Email account not found" },
      { status: 400 },
    );
  }

  const result = await getStatsByPeriod({
    period,
    fromDate,
    toDate,
    emailAccountId,
  });

  return NextResponse.json(result);
});
