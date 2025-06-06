import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getReferralStats } from "@/utils/referral/referral-tracking";
import { withError } from "@/utils/middleware";

export const GET = withError(async () => {
  const session = await auth();
  const userId = session?.user.id;

  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const stats = await getReferralStats(userId);
    
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error getting referral stats:", error);
    return NextResponse.json(
      { error: "Failed to get referral stats" },
      { status: 500 }
    );
  }
});