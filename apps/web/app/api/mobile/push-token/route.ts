import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";

const pushTokenSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/),
  platform: z.enum(["android", "ios"]),
  previousToken: z
    .string()
    .trim()
    .regex(/^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/)
    .optional(),
});

export const POST = withAuth("mobile/push-token/register", async (request) => {
  const { token, platform, previousToken } = pushTokenSchema.parse(
    await request.json(),
  );

  if (previousToken && previousToken !== token) {
    await prisma.mobilePushToken.deleteMany({
      where: {
        token: previousToken,
        userId: request.auth.userId,
      },
    });
  }

  await prisma.mobilePushToken.upsert({
    where: { token },
    create: {
      token,
      platform,
      userId: request.auth.userId,
    },
    update: {
      platform,
      userId: request.auth.userId,
    },
  });

  return NextResponse.json({ ok: true });
});

export const DELETE = withAuth(
  "mobile/push-token/unregister",
  async (request) => {
    const { token } = pushTokenSchema
      .pick({ token: true })
      .parse(await request.json());

    await prisma.mobilePushToken.deleteMany({
      where: {
        token,
        userId: request.auth.userId,
      },
    });

    return NextResponse.json({ ok: true });
  },
);
