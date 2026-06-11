import "server-only";

import { processHistoryForUser as processGoogleHistoryForUser } from "@/app/api/google/webhook/process-history";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import { getGmailCurrentHistoryId } from "@/utils/gmail/profile";
import {
  backfillRecentOutlookMessages,
  getOutlookReconcileStartDate,
  OUTLOOK_RECONCILE_MAX_MESSAGES,
} from "@/utils/outlook/backfill-recent-messages";
import { getEmailProviderRateLimitState } from "@/utils/email/rate-limit";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import {
  getPremiumUserFilter,
  getUserTier,
  hasAiAccess,
  premiumEntitlementSelect,
} from "@/utils/premium";
import { isInvalidGrantError } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

export type ReconcileEmailAccountResult =
  | {
      emailAccountId: string;
      email: string;
      provider: string;
      status: "skipped";
      reason: string;
    }
  | {
      emailAccountId: string;
      email: string;
      provider: string;
      status: "success";
      processedCount?: number;
      candidateCount?: number;
      currentHistoryId?: number;
      lastSyncedHistoryId?: string | null;
    }
  | {
      emailAccountId: string;
      email: string;
      provider: string;
      status: "error";
      message: string;
    };

export async function reconcileAllEmailInboxes({ logger }: { logger: Logger }) {
  const emailAccounts = await getEmailAccountsToReconcile();
  logger.info("Reconciling email inboxes", { count: emailAccounts.length });

  const results: ReconcileEmailAccountResult[] = [];

  for (const emailAccount of emailAccounts) {
    const accountLogger = logger.with({
      emailAccountId: emailAccount.id,
      email: emailAccount.email,
      provider: emailAccount.account.provider,
    });

    try {
      const result = await reconcileEmailAccount(emailAccount, accountLogger);
      if (result) results.push(result);
    } catch (error) {
      if (isInvalidGrantError(error)) {
        accountLogger.warn("Skipping inbox reconcile due to invalid grant", {
          error,
        });
        results.push({
          emailAccountId: emailAccount.id,
          email: emailAccount.email,
          provider: emailAccount.account.provider,
          status: "skipped",
          reason: "invalid_grant",
        });
        continue;
      }

      accountLogger.error("Failed to reconcile inbox", { error });
      results.push({
        emailAccountId: emailAccount.id,
        email: emailAccount.email,
        provider: emailAccount.account.provider,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    accountCount: emailAccounts.length,
    results,
  };
}

async function reconcileEmailAccount(
  emailAccount: Awaited<ReturnType<typeof getEmailAccountsToReconcile>>[number],
  logger: Logger,
): Promise<ReconcileEmailAccountResult | null> {
  const { account, user } = emailAccount;
  const provider = account.provider;

  const userHasAiAccess = hasAiAccess(
    getUserTier(user.premium),
    !!user.aiApiKey,
  );

  if (!userHasAiAccess) {
    return {
      emailAccountId: emailAccount.id,
      email: emailAccount.email,
      provider,
      status: "skipped",
      reason: "no_ai_access",
    };
  }

  if (!account.access_token || !account.refresh_token) {
    return {
      emailAccountId: emailAccount.id,
      email: emailAccount.email,
      provider,
      status: "skipped",
      reason: "missing_tokens",
    };
  }

  if (isGoogleProvider(provider)) {
    return reconcileGmailInbox(emailAccount, logger);
  }

  if (isMicrosoftProvider(provider)) {
    return reconcileOutlookInbox(emailAccount, logger);
  }

  return {
    emailAccountId: emailAccount.id,
    email: emailAccount.email,
    provider,
    status: "skipped",
    reason: "unsupported_provider",
  };
}

async function reconcileGmailInbox(
  emailAccount: Awaited<ReturnType<typeof getEmailAccountsToReconcile>>[number],
  logger: Logger,
): Promise<ReconcileEmailAccountResult> {
  const activeRateLimit = await getEmailProviderRateLimitState({
    emailAccountId: emailAccount.id,
    logger,
  }).catch((error) => {
    logger.warn("Failed to read provider rate-limit state for reconcile", {
      error: error instanceof Error ? error.message : error,
    });
    return null;
  });

  if (activeRateLimit?.provider === "google") {
    return {
      emailAccountId: emailAccount.id,
      email: emailAccount.email,
      provider: emailAccount.account.provider,
      status: "skipped",
      reason: "rate_limited",
    };
  }

  const gmail = await getGmailClientWithRefresh({
    accessToken: emailAccount.account.access_token,
    refreshToken: emailAccount.account.refresh_token,
    expiresAt: emailAccount.account.expires_at,
    emailAccountId: emailAccount.id,
    logger,
  });

  const currentHistoryId = await getGmailCurrentHistoryId(gmail, logger);
  if (currentHistoryId == null) {
    return {
      emailAccountId: emailAccount.id,
      email: emailAccount.email,
      provider: emailAccount.account.provider,
      status: "skipped",
      reason: "missing_history_id",
    };
  }

  const lastSyncedHistoryId = Number.parseInt(
    emailAccount.lastSyncedHistoryId || "0",
    10,
  );

  if (currentHistoryId <= lastSyncedHistoryId) {
    return {
      emailAccountId: emailAccount.id,
      email: emailAccount.email,
      provider: emailAccount.account.provider,
      status: "skipped",
      reason: "already_synced",
      currentHistoryId,
      lastSyncedHistoryId: emailAccount.lastSyncedHistoryId,
    };
  }

  logger.info("Reconciling Gmail inbox from history", {
    currentHistoryId,
    lastSyncedHistoryId: emailAccount.lastSyncedHistoryId,
  });

  await processGoogleHistoryForUser(
    {
      emailAddress: emailAccount.email,
      historyId: currentHistoryId,
    },
    {},
    logger,
  );

  return {
    emailAccountId: emailAccount.id,
    email: emailAccount.email,
    provider: emailAccount.account.provider,
    status: "success",
    currentHistoryId,
    lastSyncedHistoryId: emailAccount.lastSyncedHistoryId,
  };
}

async function reconcileOutlookInbox(
  emailAccount: Awaited<ReturnType<typeof getEmailAccountsToReconcile>>[number],
  logger: Logger,
): Promise<ReconcileEmailAccountResult> {
  const after = await getOutlookReconcileStartDate(emailAccount.id);
  const result = await backfillRecentOutlookMessages({
    emailAccountId: emailAccount.id,
    emailAddress: emailAccount.email,
    subscriptionId: emailAccount.watchEmailsSubscriptionId || undefined,
    after,
    maxMessages: OUTLOOK_RECONCILE_MAX_MESSAGES,
    logger,
  });

  return {
    emailAccountId: emailAccount.id,
    email: emailAccount.email,
    provider: emailAccount.account.provider,
    status: "success",
    processedCount: result.processedCount,
    candidateCount: result.candidateCount,
  };
}

async function getEmailAccountsToReconcile() {
  return prisma.emailAccount.findMany({
    where: {
      ...getPremiumUserFilter(),
      account: { disconnectedAt: null },
    },
    select: {
      id: true,
      email: true,
      lastSyncedHistoryId: true,
      watchEmailsSubscriptionId: true,
      account: {
        select: {
          provider: true,
          access_token: true,
          refresh_token: true,
          expires_at: true,
        },
      },
      user: {
        select: {
          aiApiKey: true,
          premium: {
            select: premiumEntitlementSelect,
          },
        },
      },
    },
  });
}
