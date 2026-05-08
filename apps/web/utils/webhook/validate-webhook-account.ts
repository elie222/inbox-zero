import { NextResponse } from "next/server";
import { env } from "@/env";
import {
  getUserTier,
  hasAiAccess,
  isPremiumRecord,
  premiumEntitlementSelect,
} from "@/utils/premium";
import { unwatchEmails } from "@/utils/email/watch-manager";
import { createEmailProvider } from "@/utils/email/provider";
import {
  getGmailClientForEmail,
  getOutlookClientForEmail,
} from "@/utils/email-account-client";
import { GmailProvider } from "@/utils/email/google";
import { OutlookProvider } from "@/utils/email/microsoft";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { logErrorWithDedupe } from "@/utils/log-error-with-dedupe";
import type { Prisma } from "@/generated/prisma/client";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";

const webhookEmailAccountSelect = {
  id: true,
  email: true,
  userId: true,
  about: true,
  multiRuleSelectionEnabled: true,
  sensitiveDataPolicy: true,
  timezone: true,
  calendarBookingLink: true,
  draftReplyConfidence: true,
  lastSyncedHistoryId: true,
  autoCategorizeSenders: true,
  filingEnabled: true,
  filingPrompt: true,
  filingConfirmationSendEmail: true,
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
    include: {
      actions: true,
    },
  },
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

      emailAccount = await prisma.emailAccount.findFirst({
        where: {
          watchEmailsSubscriptionHistory: {
            array_contains: [
              { subscriptionId: where.watchEmailsSubscriptionId },
            ],
          },
        },
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

export async function cleanupWebhookAccountOnRateLimitSkip(
  emailAccount: ValidatedWebhookAccountData | null,
  logger: Logger,
) {
  if (!emailAccount) return;

  const premium = getWebhookAccountPremium(emailAccount);
  const userHasAiAccess = hasAiAccess(
    getUserTier(premium),
    !!emailAccount.user.aiApiKey,
  );
  const shouldUnwatch =
    !!emailAccount.account?.disconnectedAt || !premium || !userHasAiAccess;

  if (!shouldUnwatch) return;

  let provider = null;
  try {
    provider = await createEmailProviderForWebhookCleanup({
      emailAccountId: emailAccount.id,
      provider: emailAccount.account?.provider,
      logger,
    });
  } catch (error) {
    logger.warn("Provider creation failed for webhook cleanup", {
      emailAccountId: emailAccount.id,
      error: error instanceof Error ? error.message : error,
    });
  }

  if (provider) {
    await unwatchEmails({
      emailAccountId: emailAccount.id,
      provider,
      subscriptionId: emailAccount.watchEmailsSubscriptionId,
      logger,
    });
    return;
  }

  logger.warn(
    "Unable to create provider for webhook cleanup, clearing watch state locally",
    {
      emailAccountId: emailAccount.id,
    },
  );
  await prisma.emailAccount.updateMany({
    where: { id: emailAccount.id },
    data: {
      watchEmailsExpirationDate: null,
      watchEmailsSubscriptionId: null,
    },
  });
}

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

  const premium = getWebhookAccountPremium(emailAccount);

  const provider = await createEmailProvider({
    emailAccountId: emailAccount.id,
    provider: emailAccount.account?.provider,
    logger,
  });

  if (!premium) {
    logger.info("Account not premium", {
      lemonSqueezyRenewsAt: emailAccount.user.premium?.lemonSqueezyRenewsAt,
      appleExpiresAt: emailAccount.user.premium?.appleExpiresAt,
      appleRevokedAt: emailAccount.user.premium?.appleRevokedAt,
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

  const tier = getUserTier(premium);
  const userHasAiAccess = hasAiAccess(tier, !!emailAccount.user.aiApiKey);

  if (!userHasAiAccess) {
    logger.info("Does not have ai access - unwatching", {
      tier,
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

function getWebhookAccountPremium(
  emailAccount: NonNullable<ValidatedWebhookAccountData>,
) {
  return env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS
    ? {
        tier: "PROFESSIONAL_ANNUALLY" as const,
        stripeSubscriptionStatus: "active",
        lemonSqueezyRenewsAt: null,
        appleSubscriptionStatus: null,
        appleExpiresAt: null,
        appleRevokedAt: null,
        adminGrantExpiresAt: null,
        adminGrantTier: null,
      }
    : isPremiumRecord(emailAccount.user.premium)
      ? emailAccount.user.premium
      : undefined;
}

async function createEmailProviderForWebhookCleanup({
  emailAccountId,
  provider,
  logger,
}: {
  emailAccountId: string;
  provider: string | null | undefined;
  logger: Logger;
}) {
  if (isGoogleProvider(provider)) {
    const client = await getGmailClientForEmail({ emailAccountId, logger });
    return new GmailProvider(client, logger, emailAccountId);
  }

  if (isMicrosoftProvider(provider)) {
    const client = await getOutlookClientForEmail({ emailAccountId, logger });
    return new OutlookProvider(client, logger);
  }

  return null;
}
