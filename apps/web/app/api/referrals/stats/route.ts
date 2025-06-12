import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { sumBy } from "lodash";
import { ReferralStatus } from "@prisma/client";

export type GetReferralStatsResponse = Awaited<
  ReturnType<typeof getReferralStats>
>;

async function getReferralStats(userId: string) {
  const referrals = await prisma.referral.findMany({
    where: { referrerUserId: userId },
  });

  const stats = {
    totalReferrals: referrals.length,
    pendingReferrals: referrals.filter(
      (r) => r.status === ReferralStatus.PENDING,
    ).length,
    totalRewards: referrals.filter((r) => r.rewardGrantedAt).length,
    totalRewardAmount: sumBy(
      referrals.filter((r) => r.rewardGrantedAt && r.rewardAmount),
      (r) => r.rewardAmount ?? 0,
    ),
  };

  return { stats };
}

export const GET = withAuth(async (request) => {
  const userId = request.auth.userId;
  const result = await getReferralStats(userId);
  return NextResponse.json(result);
});
