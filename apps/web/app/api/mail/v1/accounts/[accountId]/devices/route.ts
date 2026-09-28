import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ApnsEnvironment,
  MobilePushPlatform,
  MobilePushTokenType,
} from "@/generated/prisma/enums";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

const APNS_DEVICE_TOKEN = /^[A-Fa-f0-9]{64,200}$/;

const registerDeviceSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(APNS_DEVICE_TOKEN, "Expected a hex APNs device token"),
  platform: z.literal("ios"),
  environment: z.enum(["sandbox", "production"]),
  appVersion: z.string().trim().min(1).max(64),
});

const unregisterDeviceSchema = z.object({
  token: z.string().trim().min(1).max(4096),
});

export const POST = withEmailAccount(
  "mail/v1/devices/register",
  async (request, context) => {
    const params = await context.params;
    if (params.accountId !== request.auth.emailAccountId) {
      return NextResponse.json(
        { error: "Invalid account ID" },
        { status: 403 },
      );
    }

    const json = await readJsonBody(request);
    if (!json.ok) return json.response;
    const device = registerDeviceSchema.parse(json.value);
    const environment =
      device.environment === "sandbox"
        ? ApnsEnvironment.SANDBOX
        : ApnsEnvironment.PRODUCTION;
    const existing = await prisma.mobilePushToken.findUnique({
      where: { token: device.token },
      select: { userId: true },
    });
    const emailAccounts =
      existing && existing.userId !== request.auth.userId
        ? { set: [{ id: request.auth.emailAccountId }] }
        : { connect: [{ id: request.auth.emailAccountId }] };

    await prisma.mobilePushToken.upsert({
      where: { token: device.token },
      create: {
        token: device.token,
        platform: MobilePushPlatform.IOS,
        tokenType: MobilePushTokenType.APNS,
        environment,
        appVersion: device.appVersion,
        userId: request.auth.userId,
        emailAccounts: { connect: [{ id: request.auth.emailAccountId }] },
      },
      update: {
        platform: MobilePushPlatform.IOS,
        tokenType: MobilePushTokenType.APNS,
        environment,
        appVersion: device.appVersion,
        userId: request.auth.userId,
        emailAccounts,
      },
    });

    return NextResponse.json({ ok: true });
  },
);

export const DELETE = withEmailAccount(
  "mail/v1/devices/unregister",
  async (request, context) => {
    const params = await context.params;
    if (params.accountId !== request.auth.emailAccountId) {
      return NextResponse.json(
        { error: "Invalid account ID" },
        { status: 403 },
      );
    }

    const json = await readJsonBody(request);
    if (!json.ok) return json.response;
    const { token } = unregisterDeviceSchema.parse(json.value);
    const existing = await prisma.mobilePushToken.findFirst({
      where: {
        token,
        userId: request.auth.userId,
        emailAccounts: { some: { id: request.auth.emailAccountId } },
      },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ ok: true });

    await prisma.mobilePushToken.update({
      where: { id: existing.id },
      data: {
        emailAccounts: { disconnect: [{ id: request.auth.emailAccountId }] },
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
