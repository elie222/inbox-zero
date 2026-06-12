import type { UserAIFields } from "@/utils/llms/types";
import prisma from "@/utils/prisma";

export type AiSettings = Pick<UserAIFields, "aiProvider" | "aiModel" | "aiApiKey">;

export function hasStoredAiSettings(aiSettings: AiSettings) {
  return Boolean(aiSettings.aiProvider && aiSettings.aiApiKey);
}

export async function getOrganizationIdForUser(userId: string) {
  const membership = await prisma.member.findFirst({
    where: { emailAccount: { userId } },
    select: { organizationId: true },
  });

  return membership?.organizationId ?? null;
}

export async function getOrganizationAiSettings({
  organizationId,
  excludeUserId,
}: {
  organizationId: string;
  excludeUserId?: string;
}): Promise<AiSettings | null> {
  const configuredUser = await prisma.user.findFirst({
    where: {
      aiProvider: { not: null },
      aiApiKey: { not: null },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      emailAccounts: { some: { members: { some: { organizationId } } } },
    },
    orderBy: { createdAt: "asc" },
    select: {
      aiProvider: true,
      aiModel: true,
      aiApiKey: true,
    },
  });

  return configuredUser ?? null;
}

export async function getEffectiveAiSettings({
  userAiSettings,
  organizationId,
  excludeUserId,
}: {
  userAiSettings: AiSettings;
  organizationId?: string | null;
  excludeUserId?: string;
}): Promise<AiSettings> {
  if (hasStoredAiSettings(userAiSettings) || !organizationId) {
    return userAiSettings;
  }

  return (
    (await getOrganizationAiSettings({
      organizationId,
      excludeUserId,
    })) ?? userAiSettings
  );
}

export async function syncAiSettingsToOrganizationUsers({
  organizationId,
  aiSettings,
}: {
  organizationId: string;
  aiSettings: AiSettings;
}) {
  const members = await prisma.member.findMany({
    where: { organizationId },
    select: {
      emailAccount: {
        select: {
          userId: true,
        },
      },
    },
  });

  const userIds = Array.from(
    new Set(members.map((member) => member.emailAccount.userId)),
  );

  if (!userIds.length) {
    return [];
  }

  await prisma.user.updateMany({
    where: { id: { in: userIds } },
    data: aiSettings,
  });

  return userIds;
}
