import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MobilePushPlatform,
  MobilePushTokenType,
} from "@/generated/prisma/enums";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";

const MOBILE_PUSH_PLATFORMS = {
  android: MobilePushPlatform.ANDROID,
  ios: MobilePushPlatform.IOS,
} as const;

const EXPO_PUSH_TOKEN = /^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/;
const APNS_DEVICE_TOKEN = /^[A-Fa-f0-9]{64,200}$/;

const pushTokenSchema = z
  .object({
    token: z.string().trim().min(1).max(4096),
    platform: z.enum(["android", "ios"]),
    tokenType: z.enum(["expo", "apns"]).optional(),
    previousToken: z.string().trim().min(1).max(4096).optional(),
  })
  .superRefine((value, ctx) => {
    const tokenType =
      value.tokenType ??
      (EXPO_PUSH_TOKEN.test(value.token) ? "expo" : undefined);
    if (!tokenType) {
      ctx.addIssue({
        code: "custom",
        message: "tokenType is required for a raw device token",
        path: ["tokenType"],
      });
      return;
    }
    if (tokenType === "expo" && !EXPO_PUSH_TOKEN.test(value.token)) {
      ctx.addIssue({
        code: "custom",
        message: "Expected an Expo push token",
        path: ["token"],
      });
    }
    if (tokenType === "apns") {
      if (value.platform !== "ios") {
        ctx.addIssue({
          code: "custom",
          message: "APNs tokens are iOS only",
          path: ["platform"],
        });
      }
      if (!APNS_DEVICE_TOKEN.test(value.token)) {
        ctx.addIssue({
          code: "custom",
          message: "Expected a hex APNs device token",
          path: ["token"],
        });
      }
    }
  })
  .transform((value) => {
    const tokenType =
      value.tokenType ?? (EXPO_PUSH_TOKEN.test(value.token) ? "expo" : "apns");
    return {
      token: value.token,
      platform: MOBILE_PUSH_PLATFORMS[value.platform],
      tokenType:
        tokenType === "apns"
          ? MobilePushTokenType.APNS
          : MobilePushTokenType.EXPO,
      previousToken: value.previousToken,
    };
  });

export const POST = withAuth("mobile/push-token/register", async (request) => {
  const { token, platform, tokenType, previousToken } = pushTokenSchema.parse(
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
      tokenType,
      userId: request.auth.userId,
    },
    update: {
      platform,
      tokenType,
      userId: request.auth.userId,
    },
  });

  return NextResponse.json({ ok: true });
});

export const DELETE = withAuth(
  "mobile/push-token/unregister",
  async (request) => {
    const { token } = z
      .object({ token: z.string().trim().min(1).max(4096) })
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
