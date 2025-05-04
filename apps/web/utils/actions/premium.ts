"use server";

import { z } from "zod";
import uniq from "lodash/uniq";
import prisma from "@/utils/prisma";
import { env } from "@/env";
import { isAdminForPremium, isOnHigherTier, isPremium } from "@/utils/premium";
import { cancelPremium, upgradeToPremium } from "@/utils/premium/server";
import { changePremiumStatusSchema } from "@/app/(app)/admin/validation";
import {
  activateLemonLicenseKey,
  getLemonCustomer,
  switchPremiumPlan,
  updateSubscriptionItemQuantity,
} from "@/app/api/lemon-squeezy/api";
import { PremiumTier } from "@prisma/client";
import { ONE_MONTH_MS, ONE_YEAR_MS } from "@/utils/date";
import { getVariantId } from "@/app/(app)/premium/config";
import {
  actionClientUser,
  adminActionClient,
} from "@/utils/actions/safe-action";
import { activateLicenseKeySchema } from "@/utils/actions/premium.validation";
import { SafeError } from "@/utils/error";

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
          },
        },
      },
    });

    if (!user) return { error: "User not found" };

    const isUserPremium = isPremium(user.premium?.lemonSqueezyRenewsAt || null);
    if (isUserPremium) return;

    const currentMonth = new Date().getMonth() + 1;

    // create premium row for user if it doesn't already exist
    const premium = user.premium || (await createPremiumForUser(userId));

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
            emailAccountsAccess: true,
            admins: { select: { id: true } },
            pendingInvites: true,
          },
        },
      },
    });

    if (!user) return { error: "User not found" };

    if (!isAdminForPremium(user.premium?.admins || [], userId))
      return { error: "Not admin" };

    // check all users exist
    const uniqueEmails = uniq(emails);
    const users = await prisma.user.findMany({
      where: { email: { in: uniqueEmails } },
      select: { id: true, premium: true, email: true },
    });

    const premium = user.premium || (await createPremiumForUser(userId));

    const otherUsers = users.filter((u) => u.id !== userId);

    // make sure that the users being added to this plan are not on higher tiers already
    for (const userToAdd of otherUsers) {
      if (isOnHigherTier(userToAdd.premium?.tier, premium.tier)) {
        return {
          error:
            "One of the users you are adding to your plan already has premium and cannot be added.",
        };
      }
    }

    if ((premium.emailAccountsAccess || 0) < uniqueEmails.length) {
      // TODO lifetime users
      if (!premium.lemonSqueezySubscriptionItemId) {
        return {
          error: `You must upgrade to premium before adding more users to your account. If you already have a premium plan, please contact support at ${env.NEXT_PUBLIC_SUPPORT_EMAIL}`,
        };
      }

      await updateSubscriptionItemQuantity({
        id: premium.lemonSqueezySubscriptionItemId,
        quantity: uniqueEmails.length,
      });
    }

    // delete premium for other users when adding them to this premium plan
    // don't delete the premium for the current user
    await prisma.premium.deleteMany({
      where: {
        id: { not: premium.id },
        users: { some: { id: { in: otherUsers.map((u) => u.id) } } },
      },
    });

    // add users to plan
    await prisma.premium.update({
      where: { id: premium.id },
      data: {
        users: { connect: otherUsers.map((user) => ({ id: user.id })) },
      },
    });

    // add users to pending invites
    const nonExistingUsers = uniqueEmails.filter(
      (email) => !users.some((u) => u.email === email),
    );
    await prisma.premium.update({
      where: { id: premium.id },
      data: {
        pendingInvites: {
          set: uniq([...(premium.pendingInvites || []), ...nonExistingUsers]),
        },
      },
    });
  });

export const switchPremiumPlanAction = actionClientUser
  .metadata({ name: "switchPremiumPlan" })
  .schema(z.object({ premiumTier: z.nativeEnum(PremiumTier) }))
  .action(async ({ ctx: { userId }, parsedInput: { premiumTier } }) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        premium: {
          select: { lemonSqueezySubscriptionId: true },
        },
      },
    });

    if (!user) return { error: "User not found" };
    if (!user.premium?.lemonSqueezySubscriptionId)
      return { error: "You do not have a premium subscription" };

    const variantId = getVariantId({ tier: premiumTier });

    await switchPremiumPlan(user.premium.lemonSqueezySubscriptionId, variantId);
  });

async function createPremiumForUser(userId: string) {
  return await prisma.premium.create({
    data: {
      users: { connect: { id: userId } },
      admins: { connect: { id: userId } },
    },
  });
}

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

    await upgradeToPremium({
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
      lemonSqueezyRenewsAt: null,
    });
  });

export const changePremiumStatusAction = adminActionClient
  .metadata({ name: "changePremiumStatus" })
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
            case PremiumTier.PRO_ANNUALLY:
            case PremiumTier.BUSINESS_ANNUALLY:
            case PremiumTier.BASIC_ANNUALLY:
              return new Date(now.getTime() + ONE_YEAR_MS * (count || 1));
            case PremiumTier.PRO_MONTHLY:
            case PremiumTier.BUSINESS_MONTHLY:
            case PremiumTier.BASIC_MONTHLY:
            case PremiumTier.COPILOT_MONTHLY:
              return new Date(now.getTime() + ONE_MONTH_MS * (count || 1));
            default:
              return null;
          }
        };

        await upgradeToPremium({
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
        await cancelPremium({
          premiumId: userToUpgrade.user.premiumId,
          lemonSqueezyEndsAt: new Date(),
          expired: true,
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
