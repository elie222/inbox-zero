import { NextResponse } from "next/server";
import { withStatsApiKey } from "@/utils/api-middleware";
import { getResponseTimeStats } from "@/utils/stats/response-time/controller";
import { responseTimeQuerySchema } from "./validation";
import { createPublicApiMethodNotAllowedHandler } from "@/utils/public-api-error";

export const POST = createPublicApiMethodNotAllowedHandler(["GET"]);
export const PUT = createPublicApiMethodNotAllowedHandler(["GET"]);
export const PATCH = createPublicApiMethodNotAllowedHandler(["GET"]);
export const DELETE = createPublicApiMethodNotAllowedHandler(["GET"]);

export const GET = withStatsApiKey(
  "v1/stats/response-time",
  async (request) => {
    const { emailAccountId } = request.apiAuth;
    const { searchParams } = new URL(request.url);
    const query = responseTimeQuerySchema.parse(
      Object.fromEntries(searchParams),
    );
    const { fromDate, toDate } = query;

    const result = await getResponseTimeStats({
      fromDate,
      toDate,
      emailAccountId,
      emailProvider: request.emailProvider,
      logger: request.logger,
    });

    return NextResponse.json(result);
  },
);
