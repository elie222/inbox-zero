"use server";

import uniq from "lodash/uniq";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { env } from "@/env";
import { isAdminForPremium, isOnHigherTier, isPremium } from "@/utils/premium";
import { cancelPremium, upgradeToPremium } from "@/utils/premium/server";
import {
  changePremiumStatusSchema,
  type ChangePremiumStatusOptions,
} from "@/app/(app)/admin/validation";
import {
  activateLemonLicenseKey,
  getLemonCustomer,
  switchPremiumPlan,
  updateSubscriptionItemQuantity,
} from "@/app/api/lemon-squeezy/api";
import { isAdmin } from "@/utils/admin";
import { PremiumTier } from "@prisma/client";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import { ONE_MONTH_MS, ONE_YEAR_MS } from "@/utils/date";
import { getVariantId } from "@/app/(app)/premium/config";

export const decrementUnsubscribeCreditAction = withActionInstrumentation(
  "decrementUnsubscribeCredit",
  async () => {
    const session = await auth();
    if (!session?.user.email) return { error: "Not logged in" };

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
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
    const premium =
      user.premium || (await createPremiumForUser(session.user.id));

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
  },
);

export const updateMultiAccountPremiumAction = withActionInstrumentation(
  "updateMultiAccountPremium",
  async (emails: string[]) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
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

    if (!isAdminForPremium(user.premium?.admins || [], session.user.id))
      return { error: "Not admin" };

    // check all users exist
    const uniqueEmails = uniq(emails);
    const users = await prisma.user.findMany({
      where: { email: { in: uniqueEmails } },
      select: { id: true, premium: true, email: true },
    });

    const premium =
      user.premium || (await createPremiumForUser(session.user.id));

    const otherUsers = users.filter((u) => u.id !== session.user.id);

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
  },
);

export const switchPremiumPlanAction = withActionInstrumentation(
  "switchPremiumPlan",
  async (premiumTier: PremiumTier) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
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
  },
);

async function createPremiumForUser(userId: string) {
  return await prisma.premium.create({
    data: {
      users: { connect: { id: userId } },
      admins: { connect: { id: userId } },
    },
  });
}

export const activateLicenseKeyAction = withActionInstrumentation(
  "activateLicenseKey",
  async (licenseKey: string) => {
    const session = await auth();
    if (!session?.user.email) return { error: "Not logged in" };

    const lemonSqueezyLicense = await activateLemonLicenseKey(
      licenseKey,
      `License for ${session.user.email}`,
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
      userId: session.user.id,
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
  },
);

export const changePremiumStatusAction = withActionInstrumentation(
  "changePremiumStatus",
  async (unsafeData: ChangePremiumStatusOptions) => {
    const session = await auth();
    if (!session?.user.email) return { error: "Not logged in" };
    if (!isAdmin(session.user.email)) return { error: "Not admin" };

    const { data, error } = changePremiumStatusSchema.safeParse(unsafeData);
    if (!data) return { error };

    const userToUpgrade = await prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true, premiumId: true },
    });

    if (!userToUpgrade) return { error: "User not found" };

    let lemonSqueezySubscriptionId: number | null = null;
    let lemonSqueezySubscriptionItemId: number | null = null;
    let lemonSqueezyOrderId: number | null = null;
    let lemonSqueezyProductId: number | null = null;
    let lemonSqueezyVariantId: number | null = null;

    if (data.upgrade) {
      if (data.lemonSqueezyCustomerId) {
        const lemonCustomer = await getLemonCustomer(
          data.lemonSqueezyCustomerId.toString(),
        );
        if (!lemonCustomer.data) return { error: "Lemon customer not found" };
        const subscription = lemonCustomer.data.included?.find(
          (i) => i.type === "subscriptions",
        );
        if (!subscription) return { error: "Subscription not found" };
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
            return new Date(now.getTime() + ONE_YEAR_MS * (data.count || 1));
          case PremiumTier.PRO_MONTHLY:
          case PremiumTier.BUSINESS_MONTHLY:
          case PremiumTier.BASIC_MONTHLY:
          case PremiumTier.COPILOT_MONTHLY:
            return new Date(now.getTime() + ONE_MONTH_MS * (data.count || 1));
          default:
            return null;
        }
      };

      await upgradeToPremium({
        userId: userToUpgrade.id,
        tier: data.period,
        lemonSqueezyCustomerId: data.lemonSqueezyCustomerId || null,
        lemonSqueezySubscriptionId,
        lemonSqueezySubscriptionItemId,
        lemonSqueezyOrderId,
        lemonSqueezyProductId,
        lemonSqueezyVariantId,
        lemonSqueezyRenewsAt: getRenewsAt(data.period),
        emailAccountsAccess: data.emailAccountsAccess,
      });
    } else if (userToUpgrade) {
      if (userToUpgrade.premiumId) {
        await cancelPremium({
          premiumId: userToUpgrade.premiumId,
          lemonSqueezyEndsAt: new Date(),
          expired: true,
        });
      } else {
        return { error: "User not premium." };
      }
    }
  },
);

export const claimPremiumAdminAction = withActionInstrumentation(
  "claimPremiumAdmin",
  async () => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { premium: { select: { id: true, admins: true } } },
    });

    if (!user) return { error: "User not found" };
    if (!user.premium?.id) return { error: "User does not have a premium" };
    if (user.premium?.admins.length) return { error: "Already has admin" };

    await prisma.premium.update({
      where: { id: user.premium.id },
      data: { admins: { connect: { id: session.user.id } } },
    });
  },
);
