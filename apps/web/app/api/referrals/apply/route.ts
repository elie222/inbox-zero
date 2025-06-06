import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { createReferral } from "@/utils/referral/referral-code";
import { withError } from "@/utils/middleware";
import { z } from "zod";

const applyReferralSchema = z.object({
  referralCode: z.string().min(1),
});

export const POST = withError(async (request: Request) => {
  const session = await auth();
  const userId = session?.user.id;

  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { referralCode } = applyReferralSchema.parse(body);

    const referral = await createReferral(userId, referralCode);

    return NextResponse.json({
      success: true,
      referral: {
        id: referral.id,
        referrerUserId: referral.referrerUserId,
        status: referral.status,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.errors },
        { status: 400 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : "Failed to apply referral code";
    
    // Check for specific error messages
    if (errorMessage.includes("already referred") || 
        errorMessage.includes("Invalid referral code") ||
        errorMessage.includes("cannot refer yourself")) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      );
    }

    console.error("Error applying referral code:", error);
    return NextResponse.json(
      { error: "Failed to apply referral code" },
      { status: 500 }
    );
  }
});