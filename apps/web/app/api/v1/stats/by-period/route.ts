import { NextResponse } from "next/server";
import { withStatsApiKey } from "@/utils/api-middleware";
import { getStatsByPeriod } from "@/app/api/user/stats/by-period/controller";
import { statsByPeriodQuerySchema } from "./validation";

export const GET = withStatsApiKey("v1/stats/by-period", async (request) => {
  const { emailAccountId } = request.apiAuth;
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

  const { period, fromDate, toDate } = queryResult.data;

  const result = await getStatsByPeriod({
    period,
    fromDate,
    toDate,
    emailAccountId,
  });

  return NextResponse.json(result);
});
