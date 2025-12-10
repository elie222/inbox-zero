import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getStatsByPeriod } from "./controller";
import { statsByPeriodQuerySchema } from "@/app/api/user/stats/by-period/validation";

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
