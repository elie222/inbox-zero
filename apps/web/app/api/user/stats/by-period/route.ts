import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { statsByPeriodQuerySchema, getStatsByPeriod } from "./controller";

// Re-export types for backwards compatibility
export type { StatsByPeriodQuery as StatsByWeekParams } from "./controller";
export type { StatsByPeriodResponse as StatsByWeekResponse } from "./controller";

export const GET = withEmailAccount(
  async (request) => {
    const emailAccountId = request.auth.emailAccountId;

    const { searchParams } = new URL(request.url);
    const params = statsByPeriodQuerySchema.parse({
      period: searchParams.get("period") || "week",
      fromDate: searchParams.get("fromDate"),
      toDate: searchParams.get("toDate"),
    });

    const result = await getStatsByPeriod({
      ...params,
      emailAccountId,
    });

    return NextResponse.json(result);
  },
  { allowOrgAdmins: true },
);
