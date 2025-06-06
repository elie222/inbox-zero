import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";

export const GET = withError(async () => {
  const session = await auth();
  const userId = session?.user.id;

  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
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

    return NextResponse.json({ referrals });
  } catch (error) {
    console.error("Error getting referrals:", error);
    return NextResponse.json(
      { error: "Failed to get referrals" },
      { status: 500 }
    );
  }
});