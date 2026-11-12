import { NextResponse } from "next/server";
import { isTransactionalEmailConfigured } from "@inboxzero/transactional-email/src/delivery";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type EmailOtpSettingsResponse = NonNullable<
  Awaited<ReturnType<typeof getSettings>>
>;

export const GET = withAuth("user/email-otp", async (request) => {
  const settings = await getSettings(
    request.auth.userId,
    !!request.auth.emailOtp,
  );
  if (!settings) {
    request.logger.warn("Email OTP settings requested for missing user");
    return NextResponse.json(
      { error: "Unauthorized", isKnownError: true },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(settings, {
    headers: { "Cache-Control": "no-store" },
  });
});

async function getSettings(userId: string, emailOtpSession: boolean) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailOtpEnabled: true },
  });
  if (!user) return null;

  return {
    ...user,
    canManage: !emailOtpSession,
    emailDeliveryConfigured: isTransactionalEmailConfigured(),
  };
}
