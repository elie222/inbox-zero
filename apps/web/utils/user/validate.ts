import { SafeError } from "@/utils/error";
import { hasAiAccess, isPremiumRecord } from "@/utils/premium";
import prisma from "@/utils/prisma";

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
      timezone: true,
      calendarBookingLink: true,
      user: {
        select: {
          aiProvider: true,
          aiModel: true,
          aiApiKey: true,
          premium: {
            select: {
              appleExpiresAt: true,
              appleRevokedAt: true,
              appleSubscriptionStatus: true,
              tier: true,
              lemonSqueezyRenewsAt: true,
              stripeSubscriptionStatus: true,
            },
          },
        },
      },
      account: { select: { provider: true } },
    },
  });
  if (!emailAccount) throw new SafeError("User not found");

  const isUserPremium = isPremiumRecord(emailAccount.user.premium);
  if (!isUserPremium) throw new SafeError("Please upgrade for AI access");

  const userHasAiAccess = hasAiAccess(
    emailAccount.user.premium?.tier || null,
    !!emailAccount.user.aiApiKey,
  );
  if (!userHasAiAccess) throw new SafeError("Please upgrade for AI access");

  return { emailAccount };
}
