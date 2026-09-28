import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MailboxPushEnvironment,
  MailboxPushPlatform,
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

    const device = registerDeviceSchema.parse(await request.json());
    const environment =
      device.environment === "sandbox"
        ? MailboxPushEnvironment.SANDBOX
        : MailboxPushEnvironment.PRODUCTION;

    await prisma.mailboxPushDevice.deleteMany({
      where: {
        token: device.token,
        userId: { not: request.auth.userId },
      },
    });
    await prisma.mailboxPushDevice.upsert({
      where: {
        token_emailAccountId: {
          token: device.token,
          emailAccountId: request.auth.emailAccountId,
        },
      },
      create: {
        token: device.token,
        platform: MailboxPushPlatform.IOS,
        environment,
        appVersion: device.appVersion,
        userId: request.auth.userId,
        emailAccountId: request.auth.emailAccountId,
      },
      update: {
        platform: MailboxPushPlatform.IOS,
        environment,
        appVersion: device.appVersion,
        userId: request.auth.userId,
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

    const { token } = unregisterDeviceSchema.parse(await request.json());
    await prisma.mailboxPushDevice.deleteMany({
      where: {
        token,
        userId: request.auth.userId,
        emailAccountId: request.auth.emailAccountId,
      },
    });

    return NextResponse.json({ ok: true });
  },
);
