import { NextResponse } from "next/server";
import { withAdmin } from "@/utils/middleware";
import { getTopWeeklyUsageCosts } from "@/utils/redis/usage";

export type GetAdminTopSpendersResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withAdmin("admin/top-spenders", async () => {
  const result = await getData();
  return NextResponse.json(result);
});

async function getData() {
  const topSpenders = await getTopWeeklyUsageCosts({ limit: 25 });
  return { topSpenders };
}
