import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

const updateSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  notificationDays: z.number().min(1).max(365).optional(),
  newsletterDays: z.number().min(1).max(365).optional(),
  marketingDays: z.number().min(1).max(365).optional(),
  socialDays: z.number().min(1).max(365).optional(),
  calendarDays: z.number().min(1).max(30).optional(),
  applyLabel: z.boolean().optional(),
  enabledCategories: z.array(z.string()).optional(),
});

export type ExpirationSettingsResponse = {
  settings: {
    enabled: boolean;
    notificationDays: number;
    newsletterDays: number;
    marketingDays: number;
    socialDays: number;
    calendarDays: number;
    applyLabel: boolean;
    enabledCategories: string[];
  } | null;
};

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const settings = await prisma.emailExpirationSettings.findUnique({
    where: { emailAccountId },
  });

  return NextResponse.json({ settings });
});

export const POST = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const body = await request.json();
  const data = updateSettingsSchema.parse(body);

  const settings = await prisma.emailExpirationSettings.upsert({
    where: { emailAccountId },
    create: {
      emailAccountId,
      ...data,
    },
    update: data,
  });

  return NextResponse.json({ settings });
});
