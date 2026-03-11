import { NextResponse } from "next/server";
import { withStatsApiKey } from "@/utils/api-middleware";
import { resolveStatsEmailAccountId } from "@/app/api/v1/helpers";
import { getResponseTimeStats } from "@/app/api/user/stats/response-time/controller";
import { responseTimeQuerySchema } from "./validation";

export const GET = withStatsApiKey(
  "v1/stats/response-time",
  async (request) => {
    const {
      userId,
      accountId,
      emailAccountId: scopedEmailAccountId,
      authType,
    } = request.apiAuth;
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

    const { fromDate, toDate, email } = queryResult.data;

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
