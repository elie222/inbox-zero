import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { getOrCreateReferralCode } from "@/utils/referral/referral-code";

export type GetReferralCodeResponse = Awaited<
  ReturnType<typeof getOrCreateReferralCode>
>;

export const GET = withAuth(async (request) => {
  const userId = request.auth.userId;
  const result = await getOrCreateReferralCode(userId);
  return NextResponse.json(result);
});
