import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { getReferralStats } from "@/utils/referral/referral-tracking";

export type GetReferralStatsResponse = Awaited<ReturnType<typeof getReferralStats>>;

export const GET = withAuth(async (request) => {
  const userId = request.auth.userId;
  const result = await getReferralStats(userId);
  return NextResponse.json(result);
});