import { SafeError } from "@/utils/error";
import {
  getUserTier,
  hasAiAccess,
  isPremiumRecord,
  premiumEntitlementSelect,
} from "@/utils/premium";
import prisma from "@/utils/prisma";
import { getEffectiveAiSettings } from "@/utils/organizations/ai-settings";

export async function validateUserAndAiAccess({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      id: true,
      userId: true,
      email: true,
      about: true,
      multiRuleSelectionEnabled: true,
      sensitiveDataPolicy: true,
      timezone: true,
      calendarBookingLink: true,
      user: {
        select: {
          aiProvider: true,
          aiModel: true,
          aiApiKey: true,
          premium: {
            select: premiumEntitlementSelect,
          },
        },
      },
      members: {
        take: 1,
        select: {
          organizationId: true,
        },
      },
      account: { select: { provider: true } },
    },
  });
  if (!emailAccount) throw new SafeError("User not found");

  const effectiveAiSettings = await getEffectiveAiSettings({
    userAiSettings: emailAccount.user,
    organizationId: emailAccount.members[0]?.organizationId,
    excludeUserId: emailAccount.userId,
  });

  const isUserPremium = isPremiumRecord(emailAccount.user.premium);
  if (!isUserPremium) throw new SafeError("Please upgrade for AI access");

  const userHasAiAccess = hasAiAccess(
    getUserTier(emailAccount.user.premium),
    !!effectiveAiSettings.aiApiKey,
  );
  if (!userHasAiAccess) throw new SafeError("Please upgrade for AI access");

  const { members: _members, ...accountWithoutMembers } = emailAccount;

  return {
    emailAccount: {
      ...accountWithoutMembers,
      user: {
        ...accountWithoutMembers.user,
        ...effectiveAiSettings,
      },
    },
  };
}
