import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { ActionType, SystemType } from "@prisma/client";

// Define supported system types for digest settings
const SUPPORTED_SYSTEM_TYPES = [
  SystemType.TO_REPLY,
  SystemType.FYI,
  SystemType.AWAITING_REPLY,
  SystemType.ACTIONED,
  SystemType.NEWSLETTER,
  SystemType.MARKETING,
  SystemType.CALENDAR,
  SystemType.RECEIPT,
  SystemType.NOTIFICATION,
  SystemType.COLD_EMAIL,
] as const;

export type GetDigestSettingsResponse = Awaited<
  ReturnType<typeof getDigestSettings>
>;

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const result = await getDigestSettings({ emailAccountId });
  return NextResponse.json(result);
});

async function getDigestSettings({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      rules: {
        where: {
          systemType: {
            in: [...SUPPORTED_SYSTEM_TYPES],
          },
        },
        select: {
          systemType: true,
          actions: {
            where: {
              type: ActionType.DIGEST,
            },
          },
        },
      },
    },
  });

  if (!emailAccount) {
    return {
      toReply: false,
      newsletter: false,
      marketing: false,
      calendar: false,
      receipt: false,
      notification: false,
      coldEmail: false,
    };
  }

  // Build digest settings object
  const digestSettings = {
    toReply: false,
    awaitingReply: false,
    fyi: false,
    actioned: false,
    newsletter: false,
    marketing: false,
    calendar: false,
    receipt: false,
    notification: false,
    coldEmail: false,
  };

  // Map system types to digest settings
  const systemTypeToKey: Record<SystemType, keyof typeof digestSettings> = {
    [SystemType.TO_REPLY]: "toReply",
    [SystemType.AWAITING_REPLY]: "awaitingReply",
    [SystemType.FYI]: "fyi",
    [SystemType.ACTIONED]: "actioned",
    [SystemType.NEWSLETTER]: "newsletter",
    [SystemType.MARKETING]: "marketing",
    [SystemType.CALENDAR]: "calendar",
    [SystemType.RECEIPT]: "receipt",
    [SystemType.NOTIFICATION]: "notification",
    [SystemType.COLD_EMAIL]: "coldEmail",
  };

  // Verify all supported system types are mapped
  SUPPORTED_SYSTEM_TYPES.forEach((systemType) => {
    if (!(systemType in systemTypeToKey)) {
      throw new Error(
        `SystemType ${systemType} is not mapped in systemTypeToKey`,
      );
    }
  });

  emailAccount.rules.forEach((rule) => {
    if (rule.systemType && rule.systemType in systemTypeToKey) {
      const key = systemTypeToKey[rule.systemType];
      digestSettings[key] = rule.actions.length > 0;
    }
  });

  return digestSettings;
}
