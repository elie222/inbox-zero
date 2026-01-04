import { SafeError } from "@/utils/error";
import { hasAiAccess, isPremium } from "@/utils/premium";
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

  const isUserPremium = isPremium(
    emailAccount.user.premium?.lemonSqueezyRenewsAt || null,
    emailAccount.user.premium?.stripeSubscriptionStatus || null,
  );
  if (!isUserPremium) throw new SafeError("Please upgrade for AI access");

  const userHasAiAccess = hasAiAccess(
    emailAccount.user.premium?.tier || null,
    emailAccount.user.aiApiKey,
  );
  if (!userHasAiAccess) throw new SafeError("Please upgrade for AI access");

  return { emailAccount };
}
