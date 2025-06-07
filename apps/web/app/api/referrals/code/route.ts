import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import {
  getOrCreateReferralCode,
  generateReferralLink,
} from "@/utils/referral/referral-code";

export type GetReferralCodeResponse = Awaited<
  ReturnType<typeof getReferralCode>
>;

export const GET = withAuth(async (request) => {
  const userId = request.auth.userId;
  const result = await getReferralCode({ userId });
  return NextResponse.json(result);
});

async function getReferralCode({ userId }: { userId: string }) {
  const { code } = await getOrCreateReferralCode(userId);
  const referralLink = generateReferralLink(code);

  return {
    code,
    link: referralLink,
  };
}
