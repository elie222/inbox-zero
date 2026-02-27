import { NextResponse } from "next/server";
import { env } from "@/env";
import { hasAiAccess, isPremium } from "@/utils/premium";
import { unwatchEmails } from "@/utils/email/watch-manager";
import { createEmailProvider } from "@/utils/email/provider";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { logErrorWithDedupe } from "@/utils/log-error-with-dedupe";
import type { Prisma } from "@/generated/prisma/client";

const webhookEmailAccountSelect = {
  id: true,
  email: true,
  userId: true,
  about: true,
  multiRuleSelectionEnabled: true,
  timezone: true,
  calendarBookingLink: true,
  draftReplyConfidenceThreshold: true,
  lastSyncedHistoryId: true,
  autoCategorizeSenders: true,
  filingEnabled: true,
  filingPrompt: true,
  watchEmailsSubscriptionId: true,
  watchEmailsSubscriptionHistory: true,
  account: {
    select: {
      provider: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
      disconnectedAt: true,
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
} satisfies Prisma.EmailAccountSelect;

type WebhookEmailAccount = Prisma.EmailAccountGetPayload<{
  select: typeof webhookEmailAccountSelect;
}>;

export async function getWebhookEmailAccount(
  where: { email: string } | { watchEmailsSubscriptionId: string },
  logger: Logger,
) {
  let emailAccount: WebhookEmailAccount | null = null;

  if ("email" in where) {
    emailAccount = await prisma.emailAccount.findUnique({
      where: { email: where.email },
      select: webhookEmailAccountSelect,
    });
  } else {
    emailAccount = await prisma.emailAccount.findFirst({
      where: { watchEmailsSubscriptionId: where.watchEmailsSubscriptionId },
      select: webhookEmailAccountSelect,
    });

    if (!emailAccount) {
      logger.info("Subscription not found in current field, checking history", {
        subscriptionId: where.watchEmailsSubscriptionId,
      });

      const [foundAccount] = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "EmailAccount"
        WHERE "watchEmailsSubscriptionHistory" @> ${JSON.stringify([
          { subscriptionId: where.watchEmailsSubscriptionId },
        ])}::jsonb
        LIMIT 1
      `;

      if (foundAccount) {
        emailAccount = await prisma.emailAccount.findUnique({
          where: { id: foundAccount.id },
          select: webhookEmailAccountSelect,
        });

        if (emailAccount) {
          logger.info("Found account by historical subscription ID", {
            subscriptionId: where.watchEmailsSubscriptionId,
            email: emailAccount.email,
            currentSubscriptionId: emailAccount.watchEmailsSubscriptionId,
          });
        }
      }
    }
  }

  if (!emailAccount) {
    await logErrorWithDedupe({
      logger,
      message: "Account not found",
      context: {
        hasSubscriptionIdLookup: "watchEmailsSubscriptionId" in where,
      },
      dedupeKeyParts: {
        scope: "webhook/account-validation",
        email: "email" in where ? where.email : null,
        watchEmailsSubscriptionId:
          "watchEmailsSubscriptionId" in where
            ? where.watchEmailsSubscriptionId
            : null,
        lookupType:
          "watchEmailsSubscriptionId" in where ? "subscription" : "email",
      },
      ttlSeconds: 10 * 60,
      summaryIntervalSeconds: 2 * 60,
    });
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
    return { success: false, response: NextResponse.json({ ok: true }) };
  }

  if (emailAccount.account?.disconnectedAt) {
    logger.info("Skipping disconnected account");
    return { success: false, response: NextResponse.json({ ok: true }) };
  }

  const premium = env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS
    ? { tier: "PROFESSIONAL_ANNUALLY" as const }
    : isPremium(
          emailAccount.user.premium?.lemonSqueezyRenewsAt || null,
          emailAccount.user.premium?.stripeSubscriptionStatus || null,
        )
      ? emailAccount.user.premium
      : undefined;

  const provider = await createEmailProvider({
    emailAccountId: emailAccount.id,
    provider: emailAccount.account?.provider,
    logger,
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
      logger,
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
      logger,
    });
    return { success: false, response: NextResponse.json({ ok: true }) };
  }

  const hasAutomationRules = emailAccount.rules.length > 0;
  const hasFilingEnabled =
    emailAccount.filingEnabled && !!emailAccount.filingPrompt;

  if (!hasAutomationRules && !hasFilingEnabled) {
    logger.info("Has no rules enabled and filing not configured");
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
