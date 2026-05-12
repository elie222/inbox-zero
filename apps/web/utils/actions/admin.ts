"use server";

import { z } from "zod";
import type Stripe from "stripe";
import { deleteUser } from "@/utils/user/delete";
import prisma from "@/utils/prisma";
import { adminActionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { syncStripeDataToDb } from "@/ee/billing/stripe/sync-stripe";
import { getStripe } from "@/ee/billing/stripe";
import { premiumEntitlementSelect } from "@/utils/premium";
import { createEmailProvider } from "@/utils/email/provider";
import { processProviderHistory } from "@/utils/webhook/process-history";
import { hash } from "@/utils/hash";
import {
  hashEmailBody,
  convertGmailUrlBody,
  getLabelsBody,
  watchEmailsBody,
  syncStripeForUserBody,
  getUserInfoBody,
  loadResponseTimeDataBody,
  disableAllRulesBody,
  cleanupDraftsBody,
} from "@/utils/actions/admin.validation";
import { ensureEmailAccountsWatched } from "@/utils/email/watch-manager";
import {
  cleanupAIDraftsForAccount,
  getConfiguredDraftCleanupDays,
} from "@/utils/ai/draft-cleanup";
import {
  getAdminResponseTimeProviderDelayMs,
  getResponseTimeStats,
} from "@/app/api/user/stats/response-time/controller";

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
      const normalizedEmailAddress = emailAddress.toLowerCase();
      const emailAccount = await prisma.emailAccount.findUnique({
        where: { email: normalizedEmailAddress },
        select: {
          id: true,
          email: true,
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

      logger.info("Starting admin process history", {
        emailAccountId: emailAccount.id,
        provider,
        historyId,
        startHistoryId,
      });

      await processProviderHistory({
        provider,
        emailAddress: normalizedEmailAddress,
        historyId,
        startHistoryId,
        subscriptionId: emailAccount.watchEmailsSubscriptionId || undefined,
        resourceData: historyId
          ? {
              id: historyId.toString(),
              conversationId: startHistoryId?.toString(),
            }
          : undefined,
        logger,
      });

      logger.info("Finished admin process history", {
        emailAccountId: emailAccount.id,
        provider,
        historyId,
        startHistoryId,
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

export const adminSyncStripeForUserAction = adminActionClient
  .metadata({ name: "adminSyncStripeForUser" })
  .inputSchema(syncStripeForUserBody)
  .action(async ({ parsedInput: { email }, ctx: { logger } }) => {
    const normalizedEmail = email.toLowerCase();

    const user = await findUserByUserOrAccountEmail(normalizedEmail);

    if (!user?.premium) {
      throw new SafeError("Premium record not found");
    }

    if (!user.premium.stripeCustomerId) {
      throw new SafeError("Stripe customer ID not found");
    }

    logger.info("Starting admin Stripe sync for user", {
      userId: user.id,
      premiumId: user.premium.id,
      stripeCustomerId: user.premium.stripeCustomerId,
    });

    await syncStripeDataToDb({
      customerId: user.premium.stripeCustomerId,
      logger,
    });

    const premium = await prisma.premium.findUnique({
      where: { id: user.premium.id },
      select: {
        stripeSubscriptionStatus: true,
        stripeRenewsAt: true,
        tier: true,
      },
    });

    logger.info("Finished admin Stripe sync for user", {
      userId: user.id,
      premiumId: user.premium.id,
      stripeCustomerId: user.premium.stripeCustomerId,
      stripeSubscriptionStatus: premium?.stripeSubscriptionStatus,
    });

    return {
      stripeSubscriptionStatus: premium?.stripeSubscriptionStatus ?? null,
      stripeRenewsAt: premium?.stripeRenewsAt ?? null,
      tier: premium?.tier ?? null,
    };
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
    const hasActiveAdminGrant =
      user.premium?.adminGrantExpiresAt &&
      user.premium.adminGrantExpiresAt > new Date();

    return {
      id: user.id,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      emailAccountCount: user._count.emailAccounts,
      premium: user.premium
        ? {
            tier: user.premium.tier,
            renewsAt:
              user.premium.stripeRenewsAt ||
              user.premium.lemonSqueezyRenewsAt ||
              user.premium.adminGrantExpiresAt ||
              null,
            subscriptionStatus:
              user.premium.stripeSubscriptionStatus ||
              user.premium.lemonSubscriptionStatus ||
              (hasActiveAdminGrant ? "admin_grant" : null),
            adminGrantTier: user.premium.adminGrantTier,
            adminGrantExpiresAt: user.premium.adminGrantExpiresAt,
          }
        : null,
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

export const adminLoadResponseTimeDataAction = adminActionClient
  .metadata({ name: "adminLoadResponseTimeData" })
  .inputSchema(loadResponseTimeDataBody)
  .action(
    async ({ parsedInput: { email, maxSentMessages }, ctx: { logger } }) => {
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

      logger.info("Starting admin response time data load", {
        emailAccountId: emailAccount.id,
        maxSentMessages,
      });

      const result = await getResponseTimeStats({
        emailAccountId: emailAccount.id,
        emailProvider,
        logger,
        maxSentMessages,
        providerRequestDelayMs: getAdminResponseTimeProviderDelayMs(),
      });

      logger.info("Finished admin response time data load", {
        emailAccountId: emailAccount.id,
        emailsAnalyzed: result.emailsAnalyzed,
        maxSentMessages,
      });

      return {
        emailsAnalyzed: result.emailsAnalyzed,
        maxEmailsCap: result.maxEmailsCap,
        averageResponseTime: result.summary.averageResponseTime,
        medianResponseTime: result.summary.medianResponseTime,
      };
    },
  );

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
      const cleanupDays = await getConfiguredDraftCleanupDays(emailAccount.id);
      const result = await cleanupAIDraftsForAccount({
        emailAccountId: emailAccount.id,
        provider: emailAccount.account.provider,
        logger,
        cleanupDays,
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

async function findUserWithDetails(email?: string, userId?: string) {
  return prisma.user.findUnique({
    where: email ? { email } : { id: userId },
    select: {
      id: true,
      createdAt: true,
      lastLogin: true,
      premium: {
        select: {
          ...premiumEntitlementSelect,
          stripeRenewsAt: true,
          lemonSubscriptionStatus: true,
        },
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

async function findUserByUserOrAccountEmail(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      premium: {
        select: {
          id: true,
          stripeCustomerId: true,
        },
      },
    },
  });

  if (user) return user;

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { email },
    select: {
      user: {
        select: {
          id: true,
          premium: {
            select: {
              id: true,
              stripeCustomerId: true,
            },
          },
        },
      },
    },
  });

  return emailAccount?.user ?? null;
}
