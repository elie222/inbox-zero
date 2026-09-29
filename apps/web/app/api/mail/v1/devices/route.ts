import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MobilePushPlatform,
  MobilePushTokenType,
} from "@/generated/prisma/enums";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";

const APNS_DEVICE_TOKEN = /^[A-Fa-f0-9]{64,200}$/;

const registerDeviceSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(APNS_DEVICE_TOKEN, "Expected a hex APNs device token"),
  appVersion: z.string().trim().min(1).max(64).optional(),
});

const unregisterDeviceSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(APNS_DEVICE_TOKEN, "Expected a hex APNs device token"),
});

export const POST = withAuth("mail/v1/devices/register", async (request) => {
  const json = await readJsonBody(request);
  if (!json.ok) return json.response;
  const device = registerDeviceSchema.parse(json.value);

  await prisma.mobilePushToken.upsert({
    where: { token: device.token },
    create: {
      token: device.token,
      platform: MobilePushPlatform.IOS,
      tokenType: MobilePushTokenType.APNS,
      appVersion: device.appVersion ?? null,
      userId: request.auth.userId,
    },
    update: {
      platform: MobilePushPlatform.IOS,
      tokenType: MobilePushTokenType.APNS,
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
