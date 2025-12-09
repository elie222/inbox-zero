import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { responseTimeQuerySchema, getResponseTimeStats } from "./controller";

// Re-export types for backwards compatibility
export type { ResponseTimeQuery as ResponseTimeParams } from "./controller";
export type { ResponseTimeResponse as GetResponseTimeResponse } from "./controller";

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
