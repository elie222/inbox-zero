import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { getResponseTimeStats } from "./controller";
import { responseTimeQuerySchema } from "@/app/api/user/stats/response-time/validation";

export const GET = withEmailProvider("response-time-stats", async (request) => {
  const { searchParams } = new URL(request.url);
  const params = responseTimeQuerySchema.parse({
    fromDate: searchParams.get("fromDate"),
    toDate: searchParams.get("toDate"),
  });

  const result = await getResponseTimeStats({
    ...params,
    emailAccountId: request.auth.emailAccountId,
    emailProvider: request.emailProvider,
    logger: request.logger,
  });

  return NextResponse.json(result);
});
