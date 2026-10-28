import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MobilePushPlatform,
  MobilePushTokenType,
} from "@/generated/prisma/enums";
import { FCM_REGISTRATION_TOKEN } from "@/utils/fcm";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";

const APNS_DEVICE_TOKEN = /^[A-Fa-f0-9]{64,200}$/;

const DEVICE_PLATFORMS = {
  ios: {
    platform: MobilePushPlatform.IOS,
    tokenType: MobilePushTokenType.APNS,
  },
  android: {
    platform: MobilePushPlatform.ANDROID,
    tokenType: MobilePushTokenType.FCM,
  },
} as const;

const registerDeviceSchema = z
  .object({
    token: z.string().trim().min(1).max(4096),
    platform: z.enum(["ios", "android"]).default("ios"),
    appVersion: z.string().trim().min(1).max(64).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.platform === "ios" && !APNS_DEVICE_TOKEN.test(value.token)) {
      ctx.addIssue({
        code: "custom",
        message: "Expected a hex APNs device token",
        path: ["token"],
      });
    }
    if (
      value.platform === "android" &&
      !FCM_REGISTRATION_TOKEN.test(value.token)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Expected an FCM registration token",
        path: ["token"],
      });
    }
  });

const unregisterDeviceSchema = z.object({
  token: z
    .string()
    .trim()
    .refine(
      (token) =>
        APNS_DEVICE_TOKEN.test(token) || FCM_REGISTRATION_TOKEN.test(token),
      "Expected an APNs device token or FCM registration token",
    ),
});

export const POST = withAuth("mail/v1/devices/register", async (request) => {
  const json = await readJsonBody(request);
  if (!json.ok) return json.response;
  const device = registerDeviceSchema.parse(json.value);

  const { platform, tokenType } = DEVICE_PLATFORMS[device.platform];

  await prisma.mobilePushToken.upsert({
    where: { token: device.token },
    create: {
      token: device.token,
      platform,
      tokenType,
      appVersion: device.appVersion ?? null,
      userId: request.auth.userId,
    },
    update: {
      platform,
      tokenType,
      appVersion: device.appVersion ?? null,
      userId: request.auth.userId,
    },
  });

  return NextResponse.json({ ok: true });
});

export const DELETE = withAuth(
  "mail/v1/devices/unregister",
  async (request) => {
    const json = await readJsonBody(request);
    if (!json.ok) return json.response;
    const { token } = unregisterDeviceSchema.parse(json.value);

    await prisma.mobilePushToken.deleteMany({
      where: {
        token,
        userId: request.auth.userId,
      },
    });

    return NextResponse.json({ ok: true });
  },
);

async function readJsonBody(
  request: Request,
): Promise<
  { ok: true; value: unknown } | { ok: false; response: NextResponse }
> {
  try {
    return { ok: true, value: await request.json() };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Invalid JSON", isKnownError: true },
          { status: 400 },
        ),
      };
    }
    throw error;
  }
}
