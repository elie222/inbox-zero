import { after } from "next/server";
import prisma from "@/utils/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { ActionType } from "@/generated/prisma/enums";
import { PremiumTier } from "@/generated/prisma/enums";
import { ONE_MONTH_MS, ONE_YEAR_MS, TEN_YEARS_MS } from "@/utils/date";
import { createScopedLogger } from "@/utils/logger";
import { ensureEmailAccountsWatched } from "@/utils/email/watch-manager";
import {
  getUserTier,
  hasTierAccess,
  isPremiumRecord,
  premiumEntitlementSelect,
} from "@/utils/premium";
import { SafeError } from "@/utils/error";
import { env } from "@/env";
import { isAddingDigestAction } from "@/utils/premium/digest";

const logger = createScopedLogger("premium");
const lemonEventPriority = { update: 0, upgrade: 1, cutoff: 2 } as const;

export async function upgradeToPremiumLemon(options: {
  userId: string;
  tier: PremiumTier;
  lemonSqueezyRenewsAt: Date | null;
  lemonSqueezySubscriptionId: number | null;
  lemonSqueezySubscriptionItemId: number | null;
  lemonSqueezyOrderId: number | null;
  lemonSqueezyCustomerId: number | null;
  lemonSqueezyProductId: number | null;
  lemonSqueezyVariantId: number | null;
  lemonLicenseKey?: string;
  lemonLicenseInstanceId?: string;
  emailAccountsAccess?: number;
  /**
   * The webhook's `updated_at`. When set, an event older than the last applied
   * one is dropped and `null` is returned.
   */
  eventAt?: Date;
  isCutoff?: boolean;
}) {
  const { userId, eventAt, isCutoff, ...fields } = options;
  const priority = isCutoff
    ? lemonEventPriority.cutoff
    : lemonEventPriority.upgrade;
  const data = eventAt
    ? {
        ...fields,
        lemonSqueezyEventAt: eventAt,
        lemonSqueezyEventPriority: priority,
      }
    : fields;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { premiumId: true },
  });

  if (!user) {
    logger.error("User not found", { userId });
    throw new Error("User not found");
  }

  const premiumSelect = { users: { select: { id: true, email: true } } };
  let premiumRecord: {
    users: Array<{ id: string; email: string }>;
  } | null;

  if (user.premiumId && eventAt) {
    const { count } = await prisma.premium.updateMany({
      where: {
        id: user.premiumId,
        ...lemonEventOrder(eventAt, priority),
      },
      data,
    });
    premiumRecord =
      count === 0
        ? null
        : await prisma.premium.findUnique({
            where: { id: user.premiumId },
            select: premiumSelect,
          });
  } else if (user.premiumId) {
    premiumRecord = await prisma.premium.update({
      where: { id: user.premiumId },
      data,
      select: premiumSelect,
    });
  } else {
    premiumRecord = await prisma.premium.create({
      data: {
        users: { connect: { id: userId } },
        admins: { connect: { id: userId } },
        ...data,
      },
      select: premiumSelect,
    });
  }

  if (!premiumRecord) {
    logger.info("Ignoring stale Lemon Squeezy event", { userId, eventAt });
    return null;
  }
  const upgraded = premiumRecord;

  after(() => {
    const userIds = upgraded.users.map((premiumUser) => premiumUser.id);
    ensureEmailAccountsWatched({ userIds, logger }).catch((error) => {
      logger.error("Failed to ensure email watches after premium upgrade", {
        userIds,
        error,
      });
    });
  });

  return premiumRecord;
}

export async function grantPremiumAdmin(options: {
  userId: string;
  tier: PremiumTier;
  adminGrantExpiresAt: Date | null;
  emailAccountsAccess?: number;
}) {
  const { userId, ...data } = options;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { premiumId: true },
  });

  if (!user) {
    logger.error("User not found", { userId });
    throw new Error("User not found");
  }

  const grantData = {
    adminGrantTier: data.tier,
    adminGrantExpiresAt: data.adminGrantExpiresAt,
    emailAccountsAccess: data.emailAccountsAccess,
  };

  const premiumRecord = user.premiumId
    ? await prisma.premium.update({
        where: { id: user.premiumId },
        data: grantData,
        select: { users: { select: { id: true, email: true } } },
      })
    : await prisma.premium.create({
        data: {
          users: { connect: { id: userId } },
          admins: { connect: { id: userId } },
          ...grantData,
        },
        select: { users: { select: { id: true, email: true } } },
      });

  after(() => {
    const userIds = premiumRecord.users.map((premiumUser) => premiumUser.id);
    ensureEmailAccountsWatched({ userIds, logger }).catch((error) => {
      logger.error("Failed to ensure email watches after premium grant", {
        userIds,
        error,
      });
    });
  });

  return premiumRecord;
}

export async function applyPendingPremiumGrant({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const grant = await prisma.pendingPremiumGrant.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!grant) return;

  // Claim before granting so a grant is never applied twice or left behind.
  const { count: claimed } = await prisma.pendingPremiumGrant.deleteMany({
    where: { id: grant.id },
  });
  if (!claimed) return;

  await grantPremiumAdmin({
    userId,
    tier: grant.tier,
    adminGrantExpiresAt: getAdminGrantExpiresAt(grant),
    emailAccountsAccess: grant.emailAccountsAccess ?? undefined,
  });

  logger.info("Applied pending premium grant", { userId });
}

export function getAdminGrantExpiresAt({
  tier,
  count,
}: {
  tier: PremiumTier;
  count?: number;
}): Date | null {
  const now = Date.now();
  switch (tier) {
    case PremiumTier.BASIC_ANNUALLY:
    case PremiumTier.PRO_ANNUALLY:
    case PremiumTier.STARTER_ANNUALLY:
    case PremiumTier.PLUS_ANNUALLY:
    case PremiumTier.PROFESSIONAL_ANNUALLY:
      return new Date(now + ONE_YEAR_MS * (count || 1));
    case PremiumTier.BASIC_MONTHLY:
    case PremiumTier.PRO_MONTHLY:
    case PremiumTier.STARTER_MONTHLY:
    case PremiumTier.PLUS_MONTHLY:
    case PremiumTier.PROFESSIONAL_MONTHLY:
    case PremiumTier.COPILOT_MONTHLY:
      return new Date(now + ONE_MONTH_MS * (count || 1));
    case PremiumTier.LIFETIME:
      return new Date(now + TEN_YEARS_MS);
    default:
      return null;
  }
}

export async function assertCanUseDigests(userId: string) {
  const hasDigestAccess = await checkHasAccess({
    userId,
    minimumTier: "PLUS_MONTHLY",
  });

  if (!hasDigestAccess) {
    throw new SafeError("Digests are available on the Plus plan.", 403);
  }
}

export async function assertCanUseDigestsIfNeeded(
  userId: string,
  actions: { type: ActionType }[],
  existingActions?: { type: ActionType }[],
) {
  if (!isAddingDigestAction({ requestedActions: actions, existingActions })) {
    return;
  }

  await assertCanUseDigests(userId);
}

export async function checkHasAccess({
  userId,
  minimumTier,
}: {
  userId: string;
  minimumTier: PremiumTier;
}): Promise<boolean> {
  if (env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS) return true;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      premium: {
        select: premiumEntitlementSelect,
      },
    },
  });

  if (!user) throw new SafeError("User not found");

  if (!isPremiumRecord(user?.premium)) {
    return false;
  }

  return hasTierAccess({
    tier: getUserTier(user.premium),
    minimumTier,
  });
}

export async function applyLemonSubscriptionEvent(options: {
  premiumId: string;
  subscriptionId: number;
  variantId: number;
  eventAt: Date;
  lemonSqueezyRenewsAt: Date;
  isCutoff: boolean;
  plan?: {
    tier: PremiumTier;
    lemonSqueezyVariantId: number;
    lemonSqueezyProductId: number;
    lemonSqueezySubscriptionItemId?: number;
  };
}) {
  const priority = options.isCutoff
    ? lemonEventPriority.cutoff
    : lemonEventPriority.update;
  const { count } = await prisma.premium.updateMany({
    where: {
      id: options.premiumId,
      AND: {
        OR: [
          { lemonSqueezySubscriptionId: options.subscriptionId },
          {
            lemonSqueezySubscriptionId: null,
            lemonSqueezyVariantId: options.variantId,
          },
        ],
      },
      ...lemonEventOrder(options.eventAt, priority),
    },
    data: {
      ...options.plan,
      lemonSqueezySubscriptionId: options.subscriptionId,
      lemonSqueezyRenewsAt: options.lemonSqueezyRenewsAt,
      lemonSqueezyEventAt: options.eventAt,
      lemonSqueezyEventPriority: priority,
    },
  });
  if (count === 0) return null;

  return await prisma.premium.findUnique({
    where: { id: options.premiumId },
    select: { users: { select: { email: true } } },
  });
}

function lemonEventOrder(
  eventAt: Date,
  priority: number,
): Prisma.PremiumWhereInput {
  // At the same subscription timestamp, a cutoff wins over an upgrade,
  // an upgrade can run its effects after an update, and retries are ignored.
  return {
    OR: [
      { lemonSqueezyEventAt: null },
      { lemonSqueezyEventAt: { lt: eventAt } },
      {
        lemonSqueezyEventAt: eventAt,
        lemonSqueezyEventPriority: { lt: priority },
      },
    ],
  };
}
