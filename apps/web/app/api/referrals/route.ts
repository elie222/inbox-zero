import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type GetReferralsResponse = Awaited<ReturnType<typeof getReferrals>>;

export const GET = withAuth(async (request) => {
  const userId = request.auth.userId;
  const result = await getReferrals({ userId });
  return NextResponse.json(result);
});

async function getReferrals({ userId }: { userId: string }) {
  const referrals = await prisma.referral.findMany({
    where: { referrerUserId: userId },
    include: {
      referredUser: {
        select: {
          email: true,
          name: true,
          createdAt: true,
        },
      },
      reward: {
        select: {
          id: true,
          rewardType: true,
          rewardValue: true,
          appliedAt: true,
          expiresAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return { referrals };
}