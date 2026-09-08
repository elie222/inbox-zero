import { NextResponse } from "next/server";
import { isTransactionalEmailConfigured } from "@inboxzero/transactional-email/src/delivery";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type EmailOtpSettingsResponse = Awaited<ReturnType<typeof getSettings>>;

export const GET = withAuth("user/email-otp", async (request) =>
  NextResponse.json(
    await getSettings(request.auth.userId, !!request.auth.emailOtp),
    { headers: { "Cache-Control": "no-store" } },
  ),
);

async function getSettings(userId: string, emailOtpSession: boolean) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, emailOtpEnabled: true },
  });
  return {
    ...user,
    canManage: !emailOtpSession,
    emailDeliveryConfigured: isTransactionalEmailConfigured(),
  };
}
