import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getGmailClientForEmail } from "@/utils/account";
import {
  getPastSevenDayStats,
  statsByDayQuery,
} from "@/app/api/user/stats/day/controller";

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const query = statsByDayQuery.parse({ type });

  const gmail = await getGmailClientForEmail({ emailAccountId });

  const result = await getPastSevenDayStats({
    ...query,
    gmail,
    emailAccountId,
  });

  return NextResponse.json(result);
});
