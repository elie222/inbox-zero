import { NextResponse } from "next/server";
import { hasAiAccess, isPremium } from "@/utils/premium";
import { unwatchEmails } from "@/app/api/watch/controller";
import { createEmailProvider } from "@/utils/email/provider";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";

export async function getWebhookEmailAccount(
  where: { email: string } | { watchEmailsSubscriptionId: string },
  logger: Logger,
) {
  const query = {
    select: {
      id: true,
      email: true,
      userId: true,
      about: true,
      multiRuleSelectionEnabled: true,
      lastSyncedHistoryId: true,
      autoCategorizeSenders: true,
      watchEmailsSubscriptionId: true,
      account: {
        select: {
          provider: true,
          access_token: true,
          refresh_token: true,
          expires_at: true,
        },
      },
      rules: {
        where: { enabled: true },
        include: { actions: true },
      },
      user: {
        select: {
          aiProvider: true,
          aiModel: true,
          aiApiKey: true,
          premium: {
            select: {
              lemonSqueezyRenewsAt: true,
              stripeSubscriptionStatus: true,
              tier: true,
            },
          },
        },
      },
    },
  };

  if ("email" in where) {
    return await prisma.emailAccount.findUnique({
      where: { email: where.email },
      ...query,
    });
  }

  const emailAccount = await prisma.emailAccount.findFirst({
    where: { watchEmailsSubscriptionId: where.watchEmailsSubscriptionId },
    ...query,
  });

  if (!emailAccount) {
    logger.error("Account not found", where);
  }

  return emailAccount;
}

export type ValidatedWebhookAccountData = Awaited<
  ReturnType<typeof getWebhookEmailAccount>
>;

export type ValidatedWebhookAccount = {
  emailAccount: NonNullable<ValidatedWebhookAccountData>;
  hasAutomationRules: boolean;
  hasAiAccess: boolean;
};

type ValidationResult =
  | { success: true; data: ValidatedWebhookAccount }
  | { success: false; response: NextResponse };

export async function validateWebhookAccount(
  emailAccount: ValidatedWebhookAccountData | null,
  logger: Logger,
): Promise<ValidationResult> {
  if (!emailAccount) {
    logger.error("Account not found");
    return { success: false, response: NextResponse.json({ ok: true }) };
  }

  const premium = isPremium(
    emailAccount.user.premium?.lemonSqueezyRenewsAt || null,
    emailAccount.user.premium?.stripeSubscriptionStatus || null,
  )
    ? emailAccount.user.premium
    : undefined;

  const provider = await createEmailProvider({
    emailAccountId: emailAccount.id,
    provider: emailAccount.account?.provider,
  });

  if (!premium) {
    logger.info("Account not premium", {
      lemonSqueezyRenewsAt: emailAccount.user.premium?.lemonSqueezyRenewsAt,
      stripeSubscriptionStatus:
        emailAccount.user.premium?.stripeSubscriptionStatus,
    });
    await unwatchEmails({
      emailAccountId: emailAccount.id,
      provider,
      subscriptionId: emailAccount.watchEmailsSubscriptionId,
    });
    return { success: false, response: NextResponse.json({ ok: true }) };
  }

  const userHasAiAccess = hasAiAccess(premium.tier, emailAccount.user.aiApiKey);

  if (!userHasAiAccess) {
    logger.info("Does not have ai access - unwatching", {
      tier: premium.tier,
      hasApiKey: !!emailAccount.user.aiApiKey,
    });
    await unwatchEmails({
      emailAccountId: emailAccount.id,
      provider,
      subscriptionId: emailAccount.watchEmailsSubscriptionId,
    });
    return { success: false, response: NextResponse.json({ ok: true }) };
  }

  const hasAutomationRules = emailAccount.rules.length > 0;
  if (!hasAutomationRules) {
    logger.info("Has no rules enabled");
    return { success: false, response: NextResponse.json({ ok: true }) };
  }

  if (
    !emailAccount.account?.access_token ||
    !emailAccount.account?.refresh_token
  ) {
    logger.error("Missing access or refresh token");
    return { success: false, response: NextResponse.json({ ok: true }) };
  }

  return {
    success: true,
    data: {
      emailAccount,
      hasAutomationRules,
      hasAiAccess: userHasAiAccess,
    },
  };
}
