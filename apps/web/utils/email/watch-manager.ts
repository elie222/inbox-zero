import prisma from "@/utils/prisma";
import { hasAiAccess } from "@/utils/premium";
import { createScopedLogger } from "@/utils/logger";
import { createEmailProvider } from "@/utils/email/provider";
import { watchEmails } from "@/app/api/watch/controller";

const logger = createScopedLogger("email/watch-manager");

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
      user: {
        premium: {
          OR: [
            { lemonSqueezyRenewsAt: { gt: new Date() } },
            { stripeSubscriptionStatus: { in: ["active", "trialing"] } },
          ],
        },
      },
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

  logger.info("Watching email accounts", { count: emailAccounts.length });

  const results: WatchEmailAccountResult[] = [];

  for (const emailAccount of emailAccounts) {
    try {
      const result = await watchEmailAccount(emailAccount);
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

      logger.error("Error for user", {
        email: emailAccount.email,
        error,
      });
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
): Promise<WatchEmailAccountResult | null> {
  const { account, user, watchEmailsExpirationDate } = emailAccount;

  const userHasAiAccess = hasAiAccess(
    user.premium?.tier || null,
    user.aiApiKey,
  );

  if (!userHasAiAccess) {
    logger.info("User does not have access to AI or cold email", {
      email: emailAccount.email,
    });

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
    logger.info("User has no access token or refresh token", {
      email: emailAccount.email,
    });

    return {
      emailAccountId: emailAccount.id,
      status: "error",
      message: "Missing authentication tokens.",
    };
  }

  logger.info("Watching emails for account", {
    emailAccountId: emailAccount.id,
    email: emailAccount.email,
    provider: account.provider,
  });

  const provider = await createEmailProvider({
    emailAccountId: emailAccount.id,
    provider: account.provider,
    logger,
  });

  const result = await watchEmails({
    emailAccountId: emailAccount.id,
    provider,
  });

  if (!result.success) {
    logger.error("Failed to watch emails for account", {
      emailAccountId: emailAccount.id,
      email: emailAccount.email,
      error: result.error,
    });

    return {
      emailAccountId: emailAccount.id,
      status: "error",
      message: "Failed to set up watch for this account.",
      errorDetails: result.error,
    };
  }

  return {
    emailAccountId: emailAccount.id,
    status: "success",
    expirationDate: result.expirationDate,
  };
}
