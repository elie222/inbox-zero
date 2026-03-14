"use server";

import { z } from "zod";
import type Stripe from "stripe";
import { Prisma } from "@/generated/prisma/client";
import { deleteUser } from "@/utils/user/delete";
import prisma from "@/utils/prisma";
import { adminActionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { syncStripeDataToDb } from "@/ee/billing/stripe/sync-stripe";
import { getStripe } from "@/ee/billing/stripe";
import { createEmailProvider } from "@/utils/email/provider";
import { hash } from "@/utils/hash";
import { syncPremiumSeats } from "@/utils/premium/server";
import {
  hashEmailBody,
  convertGmailUrlBody,
  getLabelsBody,
  watchEmailsBody,
  getUserInfoBody,
  removeUserFromPremiumBody,
  disableAllRulesBody,
  cleanupDraftsBody,
} from "@/utils/actions/admin.validation";
import { ensureEmailAccountsWatched } from "@/utils/email/watch-manager";
import { cleanupAIDraftsForAccount } from "@/utils/ai/draft-cleanup";

export const adminProcessHistoryAction = adminActionClient
  .metadata({ name: "adminProcessHistory" })
  .inputSchema(
    z.object({
      emailAddress: z.string(),
      historyId: z.number().optional(),
      startHistoryId: z.number().optional(),
    }),
  )
  .action(
    async ({
      parsedInput: { emailAddress, historyId, startHistoryId },
      ctx: { logger },
    }) => {
      const emailAccount = await prisma.emailAccount.findUnique({
        where: { email: emailAddress.toLowerCase() },
        select: {
          id: true,
          account: {
            select: {
              provider: true,
            },
          },
          watchEmailsSubscriptionId: true,
        },
      });

      if (!emailAccount) {
        throw new SafeError("Email account not found");
      }

      const provider = emailAccount.account?.provider;

      if (!provider) {
        throw new SafeError("No provider found for email account");
      }

      const emailProvider = await createEmailProvider({
        emailAccountId: emailAccount.id,
        provider,
        logger,
      });

      await emailProvider.processHistory({
        emailAddress,
        historyId,
        startHistoryId,
        subscriptionId: emailAccount.watchEmailsSubscriptionId || undefined,
        resourceData: {
          id: historyId?.toString() || "0",
          conversationId: startHistoryId?.toString(),
        },
      });
    },
  );

export const adminDeleteAccountAction = adminActionClient
  .metadata({ name: "adminDeleteAccount" })
  .inputSchema(z.object({ email: z.string() }))
  .action(async ({ parsedInput: { email }, ctx: { logger } }) => {
    try {
      const userToDelete = await prisma.user.findUnique({ where: { email } });
      if (!userToDelete) throw new SafeError("User not found");

      await deleteUser({ userId: userToDelete.id, logger });
    } catch (error) {
      logger.error("Failed to delete user", { email, error });
      throw new SafeError(
        `Failed to delete user: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return { success: "User deleted" };
  });

export const adminSyncStripeForAllUsersAction = adminActionClient
  .metadata({ name: "syncStripeForAllUsers" })
  .action(async ({ ctx: { logger } }) => {
    const users = await prisma.premium.findMany({
      where: { stripeCustomerId: { not: null } },
      select: { stripeCustomerId: true },
      orderBy: { updatedAt: "asc" },
    });
    for (const premium of users) {
      if (!premium.stripeCustomerId) continue;
      logger.info("Syncing Stripe", {
        stripeCustomerId: premium.stripeCustomerId,
      });
      await syncStripeDataToDb({
        customerId: premium.stripeCustomerId,
        logger,
      });
    }
  });

export const adminSyncAllStripeCustomersToDbAction = adminActionClient
  .metadata({ name: "adminSyncAllStripeCustomersToDb" })
  .action(async ({ ctx: { logger } }) => {
    const stripe = getStripe();

    logger.info("Starting sync of all Stripe customers to DB");

    let hasMore = true;
    let startingAfter: string | undefined;
    const allCustomers: Stripe.Customer[] = [];

    while (hasMore) {
      const customers: Stripe.Response<Stripe.ApiList<Stripe.Customer>> =
        await stripe.customers.list({
          limit: 100,
          starting_after: startingAfter,
          expand: ["data.subscriptions"],
        });

      allCustomers.push(...customers.data);

      hasMore = customers.has_more;
      if (hasMore) {
        startingAfter = customers.data[customers.data.length - 1]?.id;
      }
    }

    const activeCustomers = allCustomers.filter(
      (c) => c.subscriptions && c.subscriptions.data.length > 0,
    );

    logger.info("Found active customers in Stripe.", {
      activeCustomersLength: activeCustomers.length,
    });

    for (const customer of activeCustomers) {
      if (!customer.email) {
        logger.warn("Customer in Stripe has no email", {
          customerId: customer.id,
        });
        continue;
      }

      const user = await prisma.user.findUnique({
        where: { email: customer.email },
        include: { premium: true },
      });

      if (!user) {
        logger.warn("No user found in our DB for stripe customer", {
          stripeCustomerId: customer.id,
          stripeCustomerEmail: customer.email,
        });
        continue;
      }

      if (user.premium) {
        if (
          user.premium.stripeCustomerId &&
          user.premium.stripeCustomerId !== customer.id
        ) {
          logger.warn("Stripe customer ID mismatch for user", {
            dbStripeCustomerId: user.premium.stripeCustomerId,
            stripeCustomerId: customer.id,
          });
        }

        if (user.premium.stripeCustomerId !== customer.id) {
          await prisma.premium.update({
            where: { id: user.premium.id },
            data: { stripeCustomerId: customer.id },
          });
          logger.info("Updated stripe customer ID for user", {
            stripeCustomerId: customer.id,
          });
        }
      } else {
        logger.warn(
          "User with stripe customer email exists, but has no premium account",
          {
            stripeCustomerId: customer.id,
          },
        );
      }
    }
    logger.info("Finished syncing all Stripe customers to DB");
    return { success: `Synced ${activeCustomers.length} customers.` };
  });

export const adminHashEmailAction = adminActionClient
  .metadata({ name: "adminHashEmail" })
  .inputSchema(hashEmailBody)
  .action(async ({ parsedInput: { email } }) => {
    const hashed = hash(email);
    return { hash: hashed };
  });

export const adminConvertGmailUrlAction = adminActionClient
  .metadata({ name: "adminConvertGmailUrl" })
  .inputSchema(convertGmailUrlBody)
  .action(
    async ({ parsedInput: { rfc822MessageId, email }, ctx: { logger } }) => {
      // Clean up Message-ID (remove < > if present)
      const cleanMessageId = rfc822MessageId.trim().replace(/^<|>$/g, "");

      const emailAccount = await prisma.emailAccount.findUnique({
        where: { email: email.toLowerCase() },
        select: {
          id: true,
          account: {
            select: {
              provider: true,
            },
          },
        },
      });

      if (!emailAccount) {
        throw new SafeError("Email account not found");
      }

      const emailProvider = await createEmailProvider({
        emailAccountId: emailAccount.id,
        provider: emailAccount.account.provider,
        logger,
      });

      const message =
        await emailProvider.getMessageByRfc822MessageId(cleanMessageId);

      if (!message) {
        throw new SafeError(
          `Could not find message with RFC822 Message-ID: ${cleanMessageId}`,
        );
      }

      if (!message.threadId) {
        throw new SafeError("Message does not have a thread ID");
      }

      const thread = await emailProvider.getThread(message.threadId);

      if (!thread) {
        throw new SafeError("Could not find thread for message");
      }

      const messages =
        thread.messages?.map((m) => ({
          id: m.id,
          date: m.internalDate || null,
        })) || [];

      return {
        threadId: thread.id,
        messages: messages,
        rfc822MessageId: cleanMessageId,
      };
    },
  );

export const adminGetLabelsAction = adminActionClient
  .metadata({ name: "adminGetLabels" })
  .inputSchema(getLabelsBody)
  .action(async ({ parsedInput: { emailAccountId }, ctx: { logger } }) => {
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: {
        id: true,
        account: {
          select: {
            provider: true,
          },
        },
      },
    });

    if (!emailAccount) {
      throw new SafeError("Email account not found");
    }

    const emailProvider = await createEmailProvider({
      emailAccountId: emailAccount.id,
      provider: emailAccount.account.provider,
      logger,
    });

    const labels = await emailProvider.getLabels();

    return { labels };
  });

export const adminWatchEmailsAction = adminActionClient
  .metadata({ name: "adminWatchEmails" })
  .inputSchema(watchEmailsBody)
  .action(async ({ parsedInput: { email }, ctx: { logger } }) => {
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { email: email.toLowerCase() },
      select: { userId: true },
    });

    if (!emailAccount) {
      throw new SafeError("Email account not found");
    }

    const results = await ensureEmailAccountsWatched({
      userIds: [emailAccount.userId],
      logger,
    });

    return { results };
  });

export const adminGetUserInfoAction = adminActionClient
  .metadata({ name: "adminGetUserInfo" })
  .inputSchema(getUserInfoBody)
  .action(async ({ parsedInput: { email } }) => {
    const lowerEmail = email.toLowerCase();

    // Try finding by User.email first, then fall back to EmailAccount.email
    let user = await findUserWithDetails(lowerEmail);

    if (!user) {
      const emailAccount = await prisma.emailAccount.findUnique({
        where: { email: lowerEmail },
        select: { userId: true },
      });

      if (emailAccount) {
        user = await findUserWithDetails(undefined, emailAccount.userId);
      }
    }

    if (!user) {
      throw new SafeError("User not found");
    }

    const premium = formatAdminPremium(user.premium || user.premiumAdmin);

    // Get last executed rule date per email account
    const emailAccountIds = user.emailAccounts.map((ea) => ea.id);
    const lastExecutedRules =
      emailAccountIds.length > 0
        ? await prisma.executedRule.groupBy({
            by: ["emailAccountId"],
            where: { emailAccountId: { in: emailAccountIds } },
            _max: { createdAt: true },
          })
        : [];

    const lastExecutedMap = new Map(
      lastExecutedRules.map((r) => [r.emailAccountId, r._max.createdAt]),
    );

    return {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      emailAccountCount: user._count.emailAccounts,
      premium,
      emailAccounts: user.emailAccounts.map((ea) => ({
        email: ea.email,
        createdAt: ea.createdAt,
        provider: ea.account.provider,
        disconnected: !!ea.account.disconnectedAt,
        watchExpirationDate: ea.watchEmailsExpirationDate,
        ruleCount: ea._count.rules,
        lastExecutedRuleAt: lastExecutedMap.get(ea.id) || null,
      })),
    };
  });

export const adminRemoveUserFromPremiumAction = adminActionClient
  .metadata({ name: "adminRemoveUserFromPremium" })
  .inputSchema(removeUserFromPremiumBody)
  .action(async ({ parsedInput: { premiumId, userId } }) => {
    const result = await removeUserFromPremiumForAdmin({
      premiumId,
      userId,
    });
    await syncPremiumSeats(premiumId);

    return result;
  });

export const adminDisableAllRulesAction = adminActionClient
  .metadata({ name: "adminDisableAllRules" })
  .inputSchema(disableAllRulesBody)
  .action(async ({ parsedInput: { email }, ctx: { logger } }) => {
    const emailAccounts = await prisma.emailAccount.findMany({
      where: {
        OR: [
          { email: email.toLowerCase() },
          { user: { email: email.toLowerCase() } },
        ],
      },
      select: { id: true },
    });

    if (emailAccounts.length === 0) {
      throw new SafeError("No email accounts found");
    }

    const emailAccountIds = emailAccounts.map((ea) => ea.id);

    await prisma.$transaction([
      prisma.rule.updateMany({
        where: { emailAccountId: { in: emailAccountIds } },
        data: { enabled: false },
      }),
      prisma.emailAccount.updateMany({
        where: { id: { in: emailAccountIds } },
        data: {
          followUpAwaitingReplyDays: null,
          followUpNeedsReplyDays: null,
        },
      }),
    ]);

    logger.info("Disabled all rules and follow-up for email accounts", {
      emailAccountCount: emailAccounts.length,
    });

    return {
      success: true,
      emailAccountCount: emailAccounts.length,
    };
  });

export const adminCleanupDraftsAction = adminActionClient
  .metadata({ name: "adminCleanupDrafts" })
  .inputSchema(cleanupDraftsBody)
  .action(async ({ parsedInput: { email }, ctx: { logger } }) => {
    const emailAccounts = await prisma.emailAccount.findMany({
      where: {
        OR: [
          { email: email.toLowerCase() },
          { user: { email: email.toLowerCase() } },
        ],
      },
      select: {
        id: true,
        account: { select: { provider: true } },
      },
    });

    if (emailAccounts.length === 0) {
      throw new SafeError("No email accounts found");
    }

    let totalDeleted = 0;
    let totalSkipped = 0;
    let totalAlreadyGone = 0;
    let totalErrors = 0;

    for (const emailAccount of emailAccounts) {
      const result = await cleanupAIDraftsForAccount({
        emailAccountId: emailAccount.id,
        provider: emailAccount.account.provider,
        logger,
      });

      totalDeleted += result.deleted;
      totalSkipped += result.skippedModified;
      totalAlreadyGone += result.alreadyGone;
      totalErrors += result.errors;
    }

    return {
      deleted: totalDeleted,
      skippedModified: totalSkipped,
      alreadyGone: totalAlreadyGone,
      errors: totalErrors,
    };
  });

const adminPremiumSelect = {
  id: true,
  tier: true,
  emailAccountsAccess: true,
  lemonSqueezyRenewsAt: true,
  stripeRenewsAt: true,
  stripeSubscriptionStatus: true,
  lemonSubscriptionStatus: true,
  pendingInvites: true,
  admins: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
  users: {
    select: {
      id: true,
      email: true,
      name: true,
      emailAccounts: {
        select: {
          id: true,
          email: true,
          account: {
            select: {
              provider: true,
              disconnectedAt: true,
            },
          },
        },
      },
      _count: {
        select: {
          emailAccounts: true,
        },
      },
    },
  },
} satisfies Prisma.PremiumSelect;

type AdminPremiumRecord = Prisma.PremiumGetPayload<{
  select: typeof adminPremiumSelect;
}>;
export type AdminPremiumMembership = NonNullable<
  ReturnType<typeof formatAdminPremium>
>;

async function findUserWithDetails(email?: string, userId?: string) {
  return prisma.user.findUnique({
    where: email ? { email } : { id: userId },
    select: {
      id: true,
      email: true,
      createdAt: true,
      lastLogin: true,
      premium: {
        select: adminPremiumSelect,
      },
      premiumAdmin: {
        select: adminPremiumSelect,
      },
      emailAccounts: {
        select: {
          id: true,
          email: true,
          createdAt: true,
          watchEmailsExpirationDate: true,
          account: {
            select: {
              provider: true,
              disconnectedAt: true,
            },
          },
          _count: {
            select: {
              rules: true,
            },
          },
        },
      },
      _count: {
        select: {
          emailAccounts: true,
        },
      },
    },
  });
}

function formatAdminPremium(premium: AdminPremiumRecord | null | undefined) {
  if (!premium) return null;

  const admins = [...premium.admins].sort((a, b) =>
    a.email.localeCompare(b.email),
  );
  const users = [...premium.users]
    .map((premiumUser) => ({
      id: premiumUser.id,
      email: premiumUser.email,
      name: premiumUser.name,
      isAdmin: admins.some((admin) => admin.id === premiumUser.id),
      emailAccountCount: premiumUser._count.emailAccounts,
      emailAccounts: premiumUser.emailAccounts.map((emailAccount) => ({
        id: emailAccount.id,
        email: emailAccount.email,
        provider: emailAccount.account.provider,
        disconnected: !!emailAccount.account.disconnectedAt,
      })),
    }))
    .sort((a, b) => a.email.localeCompare(b.email));

  return {
    id: premium.id,
    tier: premium.tier,
    renewsAt: premium.stripeRenewsAt || premium.lemonSqueezyRenewsAt || null,
    subscriptionStatus:
      premium.stripeSubscriptionStatus ||
      premium.lemonSubscriptionStatus ||
      null,
    emailAccountsAccess: premium.emailAccountsAccess ?? null,
    seatsUsed: users.reduce(
      (total, premiumUser) => total + premiumUser.emailAccountCount,
      0,
    ),
    admins,
    pendingInvites: premium.pendingInvites,
    users,
  };
}

async function removeUserFromPremiumForAdmin({
  premiumId,
  userId,
}: {
  premiumId: string;
  userId: string;
}) {
  const [result] = await prisma.$queryRaw<
    {
      premium_exists: boolean;
      user_exists: boolean;
      user_count: number;
      removed_user_id: string | null;
      removed_user_email: string | null;
      seats_freed: number;
    }[]
  >(Prisma.sql`
    WITH premium_lock AS (
      SELECT pg_advisory_xact_lock(hashtext(${premiumId}))
    ),
    premium_state AS (
      SELECT
        EXISTS(SELECT 1 FROM "Premium" WHERE "id" = ${premiumId}) AS premium_exists,
        EXISTS(
          SELECT 1
          FROM "User"
          WHERE "id" = ${userId}
            AND "premiumId" = ${premiumId}
        ) AS user_exists,
        (
          SELECT COUNT(*)::int
          FROM "User"
          WHERE "premiumId" = ${premiumId}
        ) AS user_count
      FROM premium_lock
    ),
    updated_user AS (
      UPDATE "User"
      SET
        "premiumId" = NULL,
        "premiumAdminId" = CASE
          WHEN "premiumAdminId" = ${premiumId} THEN NULL
          ELSE "premiumAdminId"
        END
      WHERE "id" = ${userId}
        AND "premiumId" = ${premiumId}
        AND (SELECT user_count FROM premium_state) > 1
      RETURNING
        "id" AS removed_user_id,
        "email" AS removed_user_email
    ),
    user_seats AS (
      SELECT COUNT(*)::int AS seats_freed
      FROM "EmailAccount"
      WHERE "userId" = ${userId}
    )
    SELECT
      premium_state.premium_exists,
      premium_state.user_exists,
      premium_state.user_count,
      updated_user.removed_user_id,
      updated_user.removed_user_email,
      user_seats.seats_freed
    FROM premium_state
    CROSS JOIN user_seats
    LEFT JOIN updated_user ON true
  `);

  if (!result?.premium_exists) {
    throw new SafeError("Premium not found");
  }

  if (!result.user_exists) {
    throw new SafeError("User is not on this premium");
  }

  if (result.user_count === 1) {
    throw new SafeError("Cannot remove the last user from a premium");
  }

  if (!result.removed_user_id || !result.removed_user_email) {
    throw new SafeError("Failed to remove user from premium");
  }

  return {
    premiumId,
    removedUserId: result.removed_user_id,
    removedUserEmail: result.removed_user_email,
    seatsFreed: result.seats_freed,
  };
}
