import { NextResponse } from "next/server";
import { withStatsApiKey } from "@/utils/api-middleware";
import { getStatsByPeriod } from "@/app/api/user/stats/by-period/controller";
import { statsByPeriodQuerySchema } from "./validation";
import { createPublicApiMethodNotAllowedHandler } from "@/utils/public-api-error";

export const POST = createPublicApiMethodNotAllowedHandler(["GET"]);
export const PUT = createPublicApiMethodNotAllowedHandler(["GET"]);
export const PATCH = createPublicApiMethodNotAllowedHandler(["GET"]);
export const DELETE = createPublicApiMethodNotAllowedHandler(["GET"]);

export const GET = withStatsApiKey("v1/stats/by-period", async (request) => {
  const { emailAccountId } = request.apiAuth;
  const { searchParams } = new URL(request.url);
  const query = statsByPeriodQuerySchema.parse(
    Object.fromEntries(searchParams),
  );
  const { period, fromDate, toDate } = query;

  const result = await getStatsByPeriod({
    period,
    fromDate,
    toDate,
    emailAccountId,
  });

  return NextResponse.json(result);
});
