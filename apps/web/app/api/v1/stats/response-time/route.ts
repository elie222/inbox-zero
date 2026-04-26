import { NextResponse } from "next/server";
import { withStatsApiKey } from "@/utils/api-middleware";
import { getResponseTimeStats } from "@/app/api/user/stats/response-time/controller";
import { responseTimeQuerySchema } from "./validation";

export const GET = withStatsApiKey(
  "v1/stats/response-time",
  async (request) => {
    const { emailAccountId } = request.apiAuth;
    const { searchParams } = new URL(request.url);
    const queryResult = responseTimeQuerySchema.safeParse(
      Object.fromEntries(searchParams),
    );

    if (!queryResult.success) {
      return NextResponse.json(
        { error: "Invalid query parameters" },
        { status: 400 },
      );
    }

    const { fromDate, toDate } = queryResult.data;

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
