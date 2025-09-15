"use server";

import { z } from "zod";
import { after } from "next/server";
import uniq from "lodash/uniq";
import sumBy from "lodash/sumBy";
import prisma from "@/utils/prisma";
import { env } from "@/env";
import { isAdminForPremium, isOnHigherTier, isPremium } from "@/utils/premium";
import {
  cancelPremiumLemon,
  updateAccountSeatsForPremium,
  upgradeToPremiumLemon,
} from "@/utils/premium/server";
import { changePremiumStatusSchema } from "@/app/(app)/admin/validation";
import {
  activateLemonLicenseKey,
  getLemonCustomer,
} from "@/ee/billing/lemon/index";
import { PremiumTier } from "@/generated/prisma";
import { ONE_MONTH_MS, ONE_YEAR_MS } from "@/utils/date";
import { getStripePriceId } from "@/app/(app)/premium/config";
import {
  actionClientUser,
  adminActionClient,
} from "@/utils/actions/safe-action";
import { activateLicenseKeySchema } from "@/utils/actions/premium.validation";
import { SafeError } from "@/utils/error";
import { createPremiumForUser } from "@/utils/premium/create-premium";
import { getStripe } from "@/ee/billing/stripe";
import {
  trackStripeCheckoutCreated,
  trackStripeCustomerCreated,
} from "@/utils/posthog";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("actions/premium");

const TEN_YEARS = 10 * 365 * 24 * 60 * 60 * 1000;

export const decrementUnsubscribeCreditAction = actionClientUser
  .metadata({ name: "decrementUnsubscribeCredit" })
  .action(async ({ ctx: { userId } }) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        premium: {
          select: {
            id: true,
            unsubscribeCredits: true,
            unsubscribeMonth: true,
            lemonSqueezyRenewsAt: true,
            stripeSubscriptionStatus: true,
          },
        },
      },
    });

    if (!user) throw new SafeError("User not found");

    const isUserPremium = isPremium(
      user.premium?.lemonSqueezyRenewsAt || null,
      user.premium?.stripeSubscriptionStatus || null,
    );
    if (isUserPremium) return;

    const currentMonth = new Date().getMonth() + 1;

    // create premium row for user if it doesn't already exist
    const premium = user.premium || (await createPremiumForUser({ userId }));

    if (
      !premium?.unsubscribeMonth ||
      premium?.unsubscribeMonth !== currentMonth
    ) {
      // reset the monthly credits
      await prisma.premium.update({
        where: { id: premium.id },
        data: {
          // reset and use a credit
          unsubscribeCredits: env.NEXT_PUBLIC_FREE_UNSUBSCRIBE_CREDITS - 1,
          unsubscribeMonth: currentMonth,
        },
      });
    } else {
      if (!premium?.unsubscribeCredits || premium.unsubscribeCredits <= 0)
        return;

      // decrement the monthly credits
      await prisma.premium.update({
        where: { id: premium.id },
        data: { unsubscribeCredits: { decrement: 1 } },
      });
    }
  });

export const updateMultiAccountPremiumAction = actionClientUser
  .metadata({ name: "updateMultiAccountPremium" })
  .schema(z.object({ emails: z.array(z.string()) }))
  .action(async ({ ctx: { userId }, parsedInput: { emails } }) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        premium: {
          select: {
            id: true,
            tier: true,
            lemonSqueezySubscriptionItemId: true,
            stripeSubscriptionItemId: true,
            emailAccountsAccess: true,
            admins: { select: { id: true } },
            pendingInvites: true,
            users: { select: { id: true, email: true } },
          },
        },
      },
    });

    if (!user) throw new SafeError("User not found");

    if (!isAdminForPremium(user.premium?.admins || [], userId))
      throw new SafeError("Not admin");

    // check all users exist
    const uniqueEmails = uniq(emails);
    const users = await prisma.user.findMany({
      where: { email: { in: uniqueEmails } },
      select: { id: true, premium: true, email: true },
    });

    const premium = user.premium || (await createPremiumForUser({ userId }));

    const otherUsers = users.filter((u) => u.id !== userId);

    // make sure that the users being added to this plan are not on higher tiers already
    for (const userToAdd of otherUsers) {
      if (isOnHigherTier(userToAdd.premium?.tier, premium.tier)) {
        throw new SafeError(
          "One of the users you are adding to your plan already has premium and cannot be added.",
        );
      }
    }

    if ((premium.emailAccountsAccess || 0) < uniqueEmails.length) {
      // Check if user has an active subscription
      if (
        !premium.lemonSqueezySubscriptionItemId &&
        !premium.stripeSubscriptionItemId
      ) {
        throw new SafeError(
          "You must upgrade to premium before adding more users to your account.",
        );
      }
    }

    // Get current users connected to this premium
    const currentPremium = await prisma.premium.findUnique({
      where: { id: premium.id },
      select: { users: { select: { id: true, email: true } } },
    });
    const currentUsers = currentPremium?.users || [];

    // Determine which users to disconnect (those not in the new email list)
    const usersToDisconnect = currentUsers.filter(
      (u) => u.id !== userId && !uniqueEmails.includes(u.email),
    );

    // delete premium for other users when adding them to this premium plan
    // don't delete the premium for the current user
    await prisma.premium.deleteMany({
      where: {
        id: { not: premium.id },
        users: { some: { id: { in: otherUsers.map((u) => u.id) } } },
      },
    });

    // Update users: disconnect removed users and connect new users
    await prisma.premium.update({
      where: { id: premium.id },
      data: {
        users: {
          disconnect: usersToDisconnect.map((user) => ({ id: user.id })),
          connect: otherUsers.map((user) => ({ id: user.id })),
        },
      },
    });

    // Set pending invites to exactly match non-existing users in the email list
    const nonExistingUsers = uniqueEmails.filter(
      (email) => !users.some((u) => u.email === email),
    );
    const updatedPremium = await prisma.premium.update({
      where: { id: premium.id },
      data: {
        pendingInvites: {
          set: nonExistingUsers,
        },
      },
      select: {
        users: {
          select: {
            email: true,
            _count: { select: { emailAccounts: true } },
          },
        },
        pendingInvites: true,
      },
    });

    const connectedUserEmails = new Set(
      updatedPremium.users.map((u) => u.email),
    );

    const uniquePendingInvites = (updatedPremium.pendingInvites || []).filter(
      (email) => !connectedUserEmails.has(email),
    );

    // total seats = premium users + unique pending invites
    const totalSeats =
      sumBy(updatedPremium.users, (u) => u._count.emailAccounts) +
      uniquePendingInvites.length;

    await updateAccountSeatsForPremium(premium, totalSeats);
  });

// export const switchLemonPremiumPlanAction = actionClientUser
//   .metadata({ name: "switchLemonPremiumPlan" })
//   .schema(z.object({ premiumTier: z.nativeEnum(PremiumTier) }))
//   .action(async ({ ctx: { userId }, parsedInput: { premiumTier } }) => {
//     const user = await prisma.user.findUnique({
//       where: { id: userId },
//       select: {
//         premium: {
//           select: { lemonSqueezySubscriptionId: true },
//         },
//       },
//     });

//     if (!user) throw new SafeError("User not found");
//     if (!user.premium?.lemonSqueezySubscriptionId)
//       throw new SafeError("You do not have a premium subscription");

//     const variantId = getVariantId({ tier: premiumTier });

//     await switchPremiumPlan(user.premium.lemonSqueezySubscriptionId, variantId);
//   });

export const activateLicenseKeyAction = actionClientUser
  .metadata({ name: "activateLicenseKey" })
  .schema(activateLicenseKeySchema)
  .action(async ({ ctx: { userId }, parsedInput: { licenseKey } }) => {
    const lemonSqueezyLicense = await activateLemonLicenseKey(
      licenseKey,
      `License for ${userId}`,
    );

    if (lemonSqueezyLicense.error) {
      return {
        error: lemonSqueezyLicense.data?.error || "Error activating license",
      };
    }

    const seats = {
      [env.LICENSE_1_SEAT_VARIANT_ID || ""]: 1,
      [env.LICENSE_3_SEAT_VARIANT_ID || ""]: 3,
      [env.LICENSE_5_SEAT_VARIANT_ID || ""]: 5,
      [env.LICENSE_10_SEAT_VARIANT_ID || ""]: 10,
      [env.LICENSE_25_SEAT_VARIANT_ID || ""]: 25,
    };

    await upgradeToPremiumLemon({
      userId,
      tier: PremiumTier.LIFETIME,
      lemonLicenseKey: licenseKey,
      lemonLicenseInstanceId: lemonSqueezyLicense.data?.instance?.id,
      emailAccountsAccess:
        seats[lemonSqueezyLicense.data?.meta.variant_id || ""],
      lemonSqueezyCustomerId:
        lemonSqueezyLicense.data?.meta.customer_id || null,
      lemonSqueezyOrderId: lemonSqueezyLicense.data?.meta.order_id || null,
      lemonSqueezyProductId: lemonSqueezyLicense.data?.meta.product_id || null,
      lemonSqueezyVariantId: lemonSqueezyLicense.data?.meta.variant_id || null,
      lemonSqueezySubscriptionId: null,
      lemonSqueezySubscriptionItemId: null,
      lemonSqueezyRenewsAt: new Date(Date.now() + TEN_YEARS),
    });
  });

export const adminChangePremiumStatusAction = adminActionClient
  .metadata({ name: "adminChangePremiumStatus" })
  .schema(changePremiumStatusSchema)
  .action(
    async ({
      parsedInput: {
        email,
        period,
        count,
        emailAccountsAccess,
        lemonSqueezyCustomerId,
        upgrade,
      },
    }) => {
      const userToUpgrade = await prisma.emailAccount.findUnique({
        where: { email },
        select: {
          id: true,
          user: { select: { id: true, premiumId: true } },
        },
      });

      if (!userToUpgrade?.user) throw new SafeError("User not found");

      let lemonSqueezySubscriptionId: number | null = null;
      let lemonSqueezySubscriptionItemId: number | null = null;
      let lemonSqueezyOrderId: number | null = null;
      let lemonSqueezyProductId: number | null = null;
      let lemonSqueezyVariantId: number | null = null;

      if (upgrade) {
        if (lemonSqueezyCustomerId) {
          const lemonCustomer = await getLemonCustomer(
            lemonSqueezyCustomerId.toString(),
          );
          if (!lemonCustomer.data)
            throw new SafeError("Lemon customer not found");
          const subscription = lemonCustomer.data.included?.find(
            (i) => i.type === "subscriptions",
          );
          if (!subscription) throw new SafeError("Subscription not found");
          lemonSqueezySubscriptionId = Number.parseInt(subscription.id);
          const attributes = subscription.attributes as any;
          lemonSqueezyOrderId = Number.parseInt(attributes.order_id);
          lemonSqueezyProductId = Number.parseInt(attributes.product_id);
          lemonSqueezyVariantId = Number.parseInt(attributes.variant_id);
          lemonSqueezySubscriptionItemId = attributes.first_subscription_item.id
            ? Number.parseInt(attributes.first_subscription_item.id)
            : null;
        }

        const getRenewsAt = (period: PremiumTier): Date | null => {
          const now = new Date();
          switch (period) {
            case PremiumTier.BASIC_ANNUALLY:
            case PremiumTier.PRO_ANNUALLY:
            case PremiumTier.BUSINESS_ANNUALLY:
            case PremiumTier.BUSINESS_PLUS_ANNUALLY:
              return new Date(now.getTime() + ONE_YEAR_MS * (count || 1));
            case PremiumTier.BASIC_MONTHLY:
            case PremiumTier.PRO_MONTHLY:
            case PremiumTier.BUSINESS_MONTHLY:
            case PremiumTier.BUSINESS_PLUS_MONTHLY:
            case PremiumTier.COPILOT_MONTHLY:
              return new Date(now.getTime() + ONE_MONTH_MS * (count || 1));
            case PremiumTier.LIFETIME:
              return new Date(now.getTime() + TEN_YEARS);
            default:
              return null;
          }
        };

        await upgradeToPremiumLemon({
          userId: userToUpgrade.user.id,
          tier: period,
          lemonSqueezyCustomerId: lemonSqueezyCustomerId || null,
          lemonSqueezySubscriptionId,
          lemonSqueezySubscriptionItemId,
          lemonSqueezyOrderId,
          lemonSqueezyProductId,
          lemonSqueezyVariantId,
          lemonSqueezyRenewsAt: getRenewsAt(period),
          emailAccountsAccess,
        });
      } else if (userToUpgrade.user.premiumId) {
        await cancelPremiumLemon({
          premiumId: userToUpgrade.user.premiumId,
          lemonSqueezyEndsAt: new Date(),
        });
      } else {
        throw new SafeError("User not premium.");
      }
    },
  );

export const claimPremiumAdminAction = actionClientUser
  .metadata({ name: "claimPremiumAdmin" })
  .action(async ({ ctx: { userId } }) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { premium: { select: { id: true, admins: true } } },
    });

    if (!user) throw new SafeError("User not found");
    if (!user.premium?.id) throw new SafeError("User does not have a premium");
    if (user.premium?.admins.length) throw new SafeError("Already has admin");

    await prisma.premium.update({
      where: { id: user.premium.id },
      data: { admins: { connect: { id: userId } } },
    });
  });

export const getBillingPortalUrlAction = actionClientUser
  .metadata({ name: "getBillingPortalUrl" })
  .schema(z.object({ tier: z.nativeEnum(PremiumTier).optional() }))
  .action(async ({ ctx: { userId }, parsedInput: { tier } }) => {
    const priceId = tier ? getStripePriceId({ tier }) : undefined;

    const stripe = getStripe();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        premium: {
          select: {
            stripeCustomerId: true,
            stripeSubscriptionId: true,
            stripeSubscriptionItemId: true,
          },
        },
      },
    });

    if (!user?.premium?.stripeCustomerId)
      throw new SafeError("Stripe customer id not found");

    const { url } = await stripe.billingPortal.sessions.create({
      customer: user.premium.stripeCustomerId,
      return_url: `${env.NEXT_PUBLIC_BASE_URL}/premium`,
      flow_data:
        user.premium.stripeSubscriptionId &&
        user.premium.stripeSubscriptionItemId &&
        priceId
          ? {
              type: "subscription_update_confirm",
              subscription_update_confirm: {
                subscription: user.premium.stripeSubscriptionId,
                items: [
                  {
                    id: user.premium.stripeSubscriptionItemId,
                    price: priceId,
                  },
                ],
              },
            }
          : undefined,
    });

    return { url };
  });

export const generateCheckoutSessionAction = actionClientUser
  .metadata({ name: "generateCheckoutSession" })
  .schema(z.object({ tier: z.nativeEnum(PremiumTier) }))
  .action(async ({ ctx: { userId }, parsedInput: { tier } }) => {
    const priceId = getStripePriceId({ tier });

    if (!priceId) throw new SafeError("Unknown tier. Contact support.");

    const stripe = getStripe();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        premium: {
          select: {
            id: true,
            stripeCustomerId: true,
            users: {
              select: {
                _count: { select: { emailAccounts: true } },
              },
            },
          },
        },
      },
    });
    if (!user) {
      logger.error("User not found", { userId });
      throw new SafeError("User not found");
    }

    // Get the stripeCustomerId from your KV store
    let stripeCustomerId = user.premium?.stripeCustomerId;

    // Create a new Stripe customer if this user doesn't have one
    if (!stripeCustomerId) {
      const newCustomer = await stripe.customers.create(
        {
          email: user.email,
          metadata: { userId },
        },
        // prevent race conditions of creating 2 customers in stripe for on user
        // https://github.com/stripe/stripe-node/issues/476#issuecomment-402541143
        { idempotencyKey: userId },
      );

      after(() => trackStripeCustomerCreated(user.email, newCustomer.id));

      // Store the relation between userId and stripeCustomerId
      const premium = user.premium || (await createPremiumForUser({ userId }));

      stripeCustomerId = newCustomer.id;

      await prisma.premium.update({
        where: { id: premium.id },
        data: { stripeCustomerId },
      });
    }

    const quantity =
      sumBy(user.premium?.users || [], (u) => u._count.emailAccounts) || 1;

    // ALWAYS create a checkout with a stripeCustomerId
    const checkout = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      success_url: `${env.NEXT_PUBLIC_BASE_URL}/api/stripe/success`,
      mode: "subscription",
      subscription_data: { trial_period_days: 7 },
      line_items: [{ price: priceId, quantity }],
      metadata: {
        dubCustomerId: userId,
      },
    });

    after(() => trackStripeCheckoutCreated(user.email));

    return { url: checkout.url };
  });
