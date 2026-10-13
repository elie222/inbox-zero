import { NextResponse } from "next/server";
import { env } from "@/env";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type LocalAccountSettingsResponse = Awaited<
  ReturnType<typeof getSettings>
>;

export const GET = withAuth("user/local-account", async (request) =>
  NextResponse.json(
    await getSettings(request.auth.userId, !!request.auth.emailOtp),
    {
      headers: { "Cache-Control": "no-store" },
    },
  ),
);

async function getSettings(userId: string, emailOtpSession: boolean) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true },
  });
  const credential = env.LOCAL_PASSWORD_AUTH_ENABLED
    ? await prisma.account.findFirst({
        where: { userId, provider: "credential" },
        select: { password: true },
      })
    : null;
  return {
    enabled: env.LOCAL_PASSWORD_AUTH_ENABLED,
    email: user.email,
    hasPassword: !!credential?.password,
    canManage: !emailOtpSession,
  };
}
