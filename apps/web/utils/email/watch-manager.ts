import prisma from "@/utils/prisma";
import { hasAiAccess, getPremiumUserFilter } from "@/utils/premium";
import { createScopedLogger, type Logger } from "@/utils/logger";
import { createEmailProvider } from "@/utils/email/provider";
import { captureException } from "@/utils/error";
import { cleanupInvalidTokens } from "@/utils/auth/cleanup-invalid-tokens";
import type { EmailProvider } from "@/utils/email/types";
import { createManagedOutlookSubscription } from "@/utils/outlook/subscription-manager";
import { isMicrosoftProvider } from "@/utils/email/provider-types";

export type WatchEmailAccountResult =
  | {
      emailAccountId: string;
      status: "success";
      expirationDate: Date;
    }
  | {
      emailAccountId: string;
      status: "error";
      message: string;
      errorDetails?: string;
    };

export async function ensureEmailAccountsWatched({
  userIds,
}: {
  userIds: string[] | null;
}): Promise<WatchEmailAccountResult[]> {
  const emailAccounts = await getEmailAccountsToWatch(userIds);
  return await watchEmailAccounts(emailAccounts);
}

async function getEmailAccountsToWatch(userIds: string[] | null) {
  return prisma.emailAccount.findMany({
    where: {
      ...(userIds ? { userId: { in: userIds } } : {}),
      ...getPremiumUserFilter(),
    },
    select: {
      id: true,
      email: true,
      watchEmailsExpirationDate: true,
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
          id: true,
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
    },
    orderBy: {
      watchEmailsExpirationDate: { sort: "asc", nulls: "first" },
    },
  });
}

async function watchEmailAccounts(
  emailAccounts: Awaited<ReturnType<typeof getEmailAccountsToWatch>>,
): Promise<WatchEmailAccountResult[]> {
  if (!emailAccounts.length) return [];

  const logger = createScopedLogger("email/watch-manager");

  logger.info("Watching email accounts", { count: emailAccounts.length });

  const results: WatchEmailAccountResult[] = [];

  for (const emailAccount of emailAccounts) {
    try {
      const log = logger.with({
        emailAccountId: emailAccount.id,
        email: emailAccount.email,
        provider: emailAccount.account.provider,
      });
      const result = await watchEmailAccount(emailAccount, log);
      if (result) results.push(result);
    } catch (error) {
      if (error instanceof Error) {
        const warn = [
          "invalid_grant",
          "Mail service not enabled",
          "Insufficient Permission",
          "AADSTS7000215", // Raw Azure AD error for invalid client secret (old tokens after secret rotation)
        ];

        if (warn.some((w) => error.message.includes(w))) {
          logger.warn("Not watching emails for user", {
            email: emailAccount.email,
            error,
          });
          continue;
        }
      }

      logger.error("Error for user", { error });
      results.push({
        emailAccountId: emailAccount.id,
        status: "error",
        message:
          "An unexpected error occurred while setting up watch for this account.",
        errorDetails: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

async function watchEmailAccount(
  emailAccount: Awaited<ReturnType<typeof getEmailAccountsToWatch>>[number],
  logger: Logger,
): Promise<WatchEmailAccountResult | null> {
  const { account, user, watchEmailsExpirationDate } = emailAccount;

  const userHasAiAccess = hasAiAccess(
    user.premium?.tier || null,
    user.aiApiKey,
  );

  if (!userHasAiAccess) {
    logger.info("User does not have access to AI or cold email");

    if (
      watchEmailsExpirationDate &&
      new Date(watchEmailsExpirationDate) < new Date()
    ) {
      await prisma.emailAccount.update({
        where: { id: emailAccount.id },
        data: {
          watchEmailsExpirationDate: null,
          watchEmailsSubscriptionId: null,
        },
      });
    }

    return null;
  }

  if (!account?.access_token || !account?.refresh_token) {
    logger.info("User has no access token or refresh token");

    return {
      emailAccountId: emailAccount.id,
      status: "error",
      message: "Missing authentication tokens.",
    };
  }

  logger.info("Watching emails for account");

  const provider = await createEmailProvider({
    emailAccountId: emailAccount.id,
    provider: account.provider,
    logger,
  });

  const result = await watchEmails({
    emailAccountId: emailAccount.id,
    provider,
    logger,
  });

  if (!result.success) {
    logger.error("Failed to watch emails for account", { error: result.error });

    return {
      emailAccountId: emailAccount.id,
      status: "error",
      message: "Failed to set up watch for this account.",
      errorDetails:
        result.error instanceof Error
          ? result.error.message
          : String(result.error),
    };
  }

  return {
    emailAccountId: emailAccount.id,
    status: "success",
    expirationDate: result.expirationDate,
  };
}

async function watchEmails({
  emailAccountId,
  provider,
  logger,
}: {
  emailAccountId: string;
  provider: EmailProvider;
  logger: Logger;
}): Promise<
  { success: true; expirationDate: Date } | { success: false; error: unknown }
> {
  logger.info("Watching emails");

  try {
    if (isMicrosoftProvider(provider.name)) {
      const result = await createManagedOutlookSubscription(emailAccountId);

      if (result) return { success: true, expirationDate: result };
    } else {
      const result = await provider.watchEmails();

      if (result) {
        await prisma.emailAccount.update({
          where: { id: emailAccountId },
          data: { watchEmailsExpirationDate: result.expirationDate },
        });
        return { success: true, expirationDate: result.expirationDate };
      }
    }

    const error = new Error("Provider returned no result for watch setup");
    logger.error("Error watching inbox", { error });
    return { success: false, error };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Minimal centralized handling of permanent auth failures (exact checks only)
    const isInsufficientPermissions =
      errorMessage === "Request had insufficient authentication scopes.";
    const isInvalidGrant = errorMessage === "invalid_grant";

    if (isInsufficientPermissions || isInvalidGrant) {
      logger.warn("Auth failure while watching inbox - cleaning up tokens", {
        error,
      });
      await cleanupInvalidTokens({
        emailAccountId,
        reason: isInvalidGrant ? "invalid_grant" : "insufficient_permissions",
        logger,
      });
    } else {
      logger.error("Error watching inbox", { error });
      captureException(error);
    }

    return { success: false, error };
  }
}

export async function unwatchEmails({
  emailAccountId,
  provider,
  subscriptionId,
  logger,
}: {
  emailAccountId: string;
  provider: EmailProvider;
  subscriptionId?: string | null;
  logger: Logger;
}) {
  try {
    logger.info("Unwatching emails");

    await provider.unwatchEmails(subscriptionId || undefined);
  } catch (error) {
    if (error instanceof Error && error.message.includes("invalid_grant")) {
      logger.warn("Error unwatching emails, invalid grant");
    } else {
      logger.error("Error unwatching emails", { error });
      captureException(error);
    }
  }

  // Clear the watch data regardless of provider
  await prisma.emailAccount.update({
    where: { id: emailAccountId },
    data: {
      watchEmailsExpirationDate: null,
      watchEmailsSubscriptionId: null,
    },
  });
}
