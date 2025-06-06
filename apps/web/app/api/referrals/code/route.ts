import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getOrCreateReferralCode, generateReferralLink } from "@/utils/referral/referral-code";
import { withError } from "@/utils/middleware";

export const GET = withError(async () => {
  const session = await auth();
  const userId = session?.user.id;

  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const referralCode = await getOrCreateReferralCode(userId);
    const referralLink = generateReferralLink(referralCode.code);

    return NextResponse.json({
      code: referralCode.code,
      link: referralLink,
      isActive: referralCode.isActive,
    });
  } catch (error) {
    console.error("Error getting referral code:", error);
    return NextResponse.json(
      { error: "Failed to get referral code" },
      { status: 500 }
    );
  }
});