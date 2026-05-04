"use server";

import { z } from "zod";
import { after } from "next/server";
import uniq from "lodash/uniq";
import prisma from "@/utils/prisma";
import { env } from "@/env";
import {
  getUserTier,
  isAdminForPremium,
  isOnHigherTier,
  isPremiumRecord,
  premiumEntitlementSelect,
} from "@/utils/premium";
import {
  grantPremiumAdmin,
  upgradeToPremiumLemon,
} from "@/utils/premium/server";
import {
  getStripeBillingQuantity,
  syncPremiumSeats,
} from "@/utils/premium/seats";
import { changePremiumStatusSchema } from "@/app/(app)/admin/validation";
import { activateLemonLicenseKey } from "@/ee/billing/lemon/index";
import { PremiumTier } from "@/generated/prisma/enums";
import { ONE_MONTH_MS, ONE_YEAR_MS } from "@/utils/date";
import {
  BRIEF_MY_MEETING_PRICE_ID_ANNUALLY,
  BRIEF_MY_MEETING_PRICE_ID_MONTHLY,
  getStripePriceId,
} from "@/app/(app)/premium/config";
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

const TEN_YEARS = 10 * 365 * 24 * 60 * 60 * 1000;
const checkoutOfferSchema = z.enum(["BRIEF_MY_MEETING"]);

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
            ...premiumEntitlementSelect,
          },
        },
      },
    });

    if (!user) throw new SafeError("User not found");

    const isUserPremium = isPremiumRecord(user.premium);
    if (isUserPremium) return;

    const currentMonth = new Date().getMonth() + 1;

    // create premium row for user if it doesn't already exist
    const premium = user.premium || (await createPremiumForUser({ userId }));

    const resetResult = await prisma.premium.updateMany({
      where: {
        id: premium.id,
        OR: [
          { unsubscribeMonth: null },
          { unsubscribeMonth: { not: currentMonth } },
        ],
      },
      data: {
        // reset and use a credit
        unsubscribeCredits: env.NEXT_PUBLIC_FREE_UNSUBSCRIBE_CREDITS - 1,
        unsubscribeMonth: currentMonth,
      },
    });

    if (resetResult.count > 0) return;

    await prisma.premium.updateMany({
      where: {
        id: premium.id,
        unsubscribeMonth: currentMonth,
        unsubscribeCredits: { gt: 0 },
      },
      data: { unsubscribeCredits: { decrement: 1 } },
    });
  });

export const updateMultiAccountPremiumAction = actionClientUser
  .metadata({ name: "updateMultiAccountPremium" })
  .inputSchema(z.object({ emails: z.array(z.string()) }))
  .action(async ({ ctx: { userId }, parsedInput: { emails } }) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        premium: {
          select: {
            id: true,
            ...premiumEntitlementSelect,
            lemonSqueezySubscriptionItemId: true,
            stripeSubscriptionItemId: true,
            emailAccountsAccess: true,
            admins: { select: { id: true } },
            pendingInvites: true,
            users: { select: { id: true, email: true } },
          },
        },
        emailAccounts: { select: { email: true } },
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
      if (
        isOnHigherTier(getUserTier(userToAdd.premium), getUserTier(premium))
      ) {
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
    // Exclude emails that belong to the user's own EmailAccount records
    const userEmailAccounts = new Set(
      user.emailAccounts?.map((ea) => ea.email) || [],
    );
    const nonExistingUsers = uniqueEmails.filter(
      (email) =>
        !users.some((u) => u.email === email) && !userEmailAccounts.has(email),
    );
    await prisma.premium.update({
      where: { id: premium.id },
      data: {
        pendingInvites: {
          set: nonExistingUsers,
        },
      },
    });

    await syncPremiumSeats(premium.id);
  });

// export const switchLemonPremiumPlanAction = actionClientUser
//   .metadata({ name: "switchLemonPremiumPlan" })
//   .inputSchema(z.object({ premiumTier: z.nativeEnum(PremiumTier) }))
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
  .inputSchema(activateLicenseKeySchema)
  .action(async ({ ctx: { userId, logger }, parsedInput: { licenseKey } }) => {
    const lemonSqueezyLicense = await activateLemonLicenseKey(
      licenseKey,
      `License for ${userId}`,
      logger,
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
  .inputSchema(changePremiumStatusSchema)
  .action(
    async ({
      parsedInput: { email, period, count, emailAccountsAccess, upgrade },
    }) => {
      const userToUpgrade = await prisma.emailAccount.findUnique({
        where: { email },
        select: {
          id: true,
          user: { select: { id: true, premiumId: true } },
        },
      });

      if (!userToUpgrade?.user) throw new SafeError("User not found");

      if (upgrade) {
        const getGrantExpiresAt = (period: PremiumTier): Date | null => {
          const now = new Date();
          switch (period) {
            case PremiumTier.BASIC_ANNUALLY:
            case PremiumTier.PRO_ANNUALLY:
            case PremiumTier.STARTER_ANNUALLY:
            case PremiumTier.PLUS_ANNUALLY:
            case PremiumTier.PROFESSIONAL_ANNUALLY:
              return new Date(now.getTime() + ONE_YEAR_MS * (count || 1));
            case PremiumTier.BASIC_MONTHLY:
            case PremiumTier.PRO_MONTHLY:
            case PremiumTier.STARTER_MONTHLY:
            case PremiumTier.PLUS_MONTHLY:
            case PremiumTier.PROFESSIONAL_MONTHLY:
            case PremiumTier.COPILOT_MONTHLY:
              return new Date(now.getTime() + ONE_MONTH_MS * (count || 1));
            case PremiumTier.LIFETIME:
              return new Date(now.getTime() + TEN_YEARS);
            default:
              return null;
          }
        };

        await grantPremiumAdmin({
          userId: userToUpgrade.user.id,
          tier: period,
          adminGrantExpiresAt: getGrantExpiresAt(period),
          emailAccountsAccess,
        });
      } else if (userToUpgrade.user.premiumId) {
        await prisma.premium.update({
          where: { id: userToUpgrade.user.premiumId },
          data: {
            adminGrantExpiresAt: null,
            adminGrantTier: null,
          },
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
  .inputSchema(z.object({ tier: z.nativeEnum(PremiumTier).optional() }))
  .action(async ({ ctx: { userId, logger }, parsedInput: { tier } }) => {
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
            stripeSubscriptionStatus: true,
            users: {
              select: { _count: { select: { emailAccounts: true } } },
            },
          },
        },
      },
    });

    if (!user?.premium?.stripeCustomerId) {
      logger.error("Stripe customer id not found");
      throw new SafeError("Stripe customer id not found");
    }

    const subscription =
      priceId &&
      user.premium.stripeSubscriptionId &&
      user.premium.stripeSubscriptionStatus !== "canceled"
        ? await stripe.subscriptions
            .retrieve(user.premium.stripeSubscriptionId)
            .catch((error) => {
              logger.error("Failed to retrieve Stripe subscription", {
                error: error?.message,
                subscriptionId: user.premium?.stripeSubscriptionId,
              });
              return null;
            })
        : null;

    // we can't use the billing portal if the subscription is canceled
    if (priceId && subscription && subscription.status === "canceled") {
      return { url: null };
    }

    const quantity = getStripeBillingQuantity({
      priceId,
      users: user.premium?.users || [],
    });

    const { url } = await stripe.billingPortal.sessions.create({
      customer: user.premium.stripeCustomerId,
      return_url: `${env.NEXT_PUBLIC_BASE_URL}/premium`,
      flow_data:
        subscription &&
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
                    quantity,
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
  .inputSchema(
    z.object({
      tier: z.nativeEnum(PremiumTier),
      offer: checkoutOfferSchema.optional(),
    }),
  )
  .action(async ({ ctx: { userId, logger }, parsedInput: { tier, offer } }) => {
    const priceId = getCheckoutPriceId({ tier, offer });

    if (!priceId) throw new SafeError("Unknown tier. Contact support.");

    const stripe = getStripe();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        _count: { select: { emailAccounts: true } },
        premium: {
          select: {
            id: true,
            stripeCustomerId: true,
            users: {
              select: { _count: { select: { emailAccounts: true } } },
            },
          },
        },
      },
    });
    if (!user) {
      logger.error("User not found");
      throw new SafeError("User not found");
    }

    let stripeCustomerId = user.premium?.stripeCustomerId;

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

      const premium = user.premium || (await createPremiumForUser({ userId }));

      stripeCustomerId = newCustomer.id;

      await prisma.premium.update({
        where: { id: premium.id },
        data: { stripeCustomerId },
      });
    }

    const quantity = getStripeBillingQuantity({
      priceId,
      users: user.premium?.users || [{ _count: user._count }],
    });

    // ALWAYS create a checkout with a stripeCustomerId
    const checkout = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      success_url: `${env.NEXT_PUBLIC_BASE_URL}/api/stripe/success`,
      cancel_url: `${env.NEXT_PUBLIC_BASE_URL}/premium`,
      mode: "subscription",
      subscription_data: { trial_period_days: 7 },
      line_items: [{ price: priceId, quantity }],
      allow_promotion_codes: true,
      payment_method_collection: "always",
      metadata: {
        dubCustomerId: userId,
      },
    });

    after(() =>
      trackStripeCheckoutCreated(user.email, {
        billingProvider: "stripe",
        quantity,
        tier,
      }),
    );

    return { url: checkout.url };
  });

function getCheckoutPriceId({
  tier,
  offer,
}: {
  tier: PremiumTier;
  offer?: z.infer<typeof checkoutOfferSchema>;
}) {
  if (offer === "BRIEF_MY_MEETING") {
    if (tier === "STARTER_ANNUALLY") return BRIEF_MY_MEETING_PRICE_ID_ANNUALLY;
    if (tier === "STARTER_MONTHLY") return BRIEF_MY_MEETING_PRICE_ID_MONTHLY;
    return null;
  }

  return getStripePriceId({ tier });
}
