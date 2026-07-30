import { NextResponse } from "next/server";
import {
  getAdminModelSpendForWeek,
  MODEL_SPEND_LIMIT,
} from "@/utils/admin/model-spend";
import { withAdmin } from "@/utils/middleware";

export type GetAdminThroughputResponse = Awaited<
  ReturnType<typeof getThroughput>
>;

export const GET = withAdmin("admin/stats/throughput", async () =>
  NextResponse.json(await getThroughput()),
);

async function getThroughput() {
  const modelSpend = await getAdminModelSpendForWeek();

  return {
    modelSpend,
    // Sums over the returned models only, so they under-report once there are
    // more than MODEL_SPEND_LIMIT distinct provider/model pairs. The UI says
    // "top N" rather than claiming a total.
    modelLimit: MODEL_SPEND_LIMIT,
    truncated: modelSpend.length >= MODEL_SPEND_LIMIT,
    totalCost: modelSpend.reduce((sum, row) => sum + row.cost, 0),
    totalCalls: modelSpend.reduce((sum, row) => sum + row.calls, 0),
  };
}
