import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { isOnHigherTier } from "@/utils/premium";

/**
 * Prepare premium mutations to execute atomically with the account merge
 */
export async function getPremiumTransferOperations({
  sourceUserId,
  targetUserId,
  logger,
}: {
  sourceUserId: string;
  targetUserId: string;
  logger: Logger;
}) {
  logger.info("Preparing premium transfer during user merge", {
    sourceUserId,
    targetUserId,
  });

  try {
    const sourceUser = await prisma.user.findUnique({
      where: { id: sourceUserId },
      select: {
        id: true,
        email: true,
        premiumId: true,
        premiumAdminId: true,
        premium: {
          select: {
            id: true,
            tier: true,
            users: { select: { id: true, email: true } },
            admins: { select: { id: true, email: true } },
          },
        },
        premiumAdmin: {
          select: {
            id: true,
            users: { select: { id: true, email: true } },
            admins: { select: { id: true, email: true } },
          },
        },
      },
    });

    if (!sourceUser) {
      logger.warn("Source user not found", { sourceUserId });
      return [];
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        premiumId: true,
        premiumAdminId: true,
        premium: {
          select: {
            id: true,
            tier: true,
          },
        },
      },
    });

    if (!targetUser) {
      logger.error("Target user not found", { targetUserId });
      throw new Error(`Target user ${targetUserId} not found`);
    }

    const operations: Prisma.PrismaPromise<unknown>[] = [];

    // Handle premium subscription scenarios
    if (sourceUser.premiumId && targetUser.premiumId) {
      // Both users have premium - choose the higher tier
      const sourceTier = sourceUser.premium?.tier;
      const targetTier = targetUser.premium?.tier;

      logger.warn(
        "Both users have premium subscriptions - choosing higher tier",
        {
          sourcePremiumId: sourceUser.premiumId,
          targetPremiumId: targetUser.premiumId,
          sourceTier,
          targetTier,
          sourceUserId,
          targetUserId,
        },
      );

      // If same premium or source has higher tier, use source premium
      // If target has higher tier, keep target premium
      const shouldUseSourcePremium =
        sourceUser.premiumId === targetUser.premiumId ||
        !isOnHigherTier(targetTier, sourceTier);

      if (
        shouldUseSourcePremium &&
        sourceUser.premiumId !== targetUser.premiumId
      ) {
        // Update target user to use source's premium (atomic operation that handles the relationship change)
        operations.push(
          prisma.user.update({
            where: { id: targetUserId },
            data: { premiumId: sourceUser.premiumId },
          }),
        );

        logger.info(
          "Target user's premium subscription replaced with source user's higher tier premium",
          { chosenTier: sourceTier },
        );
      } else {
        logger.info(
          "Target user keeps their premium subscription (higher or equal tier)",
          { chosenTier: targetTier },
        );
      }
    } else if (sourceUser.premiumId && sourceUser.premium) {
      // Only source user has premium - transfer to target
      logger.info("Transferring premium subscription from source to target", {
        premiumId: sourceUser.premiumId,
        sourceUserId,
        targetUserId,
      });

      // Update target user to use source's premium
      operations.push(
        prisma.user.update({
          where: { id: targetUserId },
          data: { premiumId: sourceUser.premiumId },
        }),
      );
    } else if (targetUser.premiumId) {
      // Only target user has premium - no action needed, they keep their premium
      logger.info("Target user already has premium, no transfer needed", {
        targetPremiumId: targetUser.premiumId,
        targetUserId,
      });
    } else {
      // Neither user has premium
      logger.info("Neither user has premium subscription", {
        sourceUserId,
        targetUserId,
      });
    }

    // Handle premium admin transfer (user is a premium admin)
    if (sourceUser.premiumAdminId && sourceUser.premiumAdmin) {
      logger.info("Transferring premium admin rights", {
        premiumId: sourceUser.premiumAdminId,
        sourceUserId,
        targetUserId,
      });

      if (targetUser.premiumAdminId) {
        logger.warn(
          "Target user already has premium admin rights, will merge",
          {
            sourcePremiumAdminId: sourceUser.premiumAdminId,
            targetPremiumAdminId: targetUser.premiumAdminId,
          },
        );
      }

      // Connect target user as admin to source premium admin
      operations.push(
        prisma.premium.update({
          where: { id: sourceUser.premiumAdminId },
          data: {
            admins: {
              connect: { id: targetUserId },
            },
          },
        }),
      );

      // Update target user's premiumAdminId if they don't have one
      if (!targetUser.premiumAdminId) {
        operations.push(
          prisma.user.update({
            where: { id: targetUserId },
            data: { premiumAdminId: sourceUser.premiumAdminId },
          }),
        );
      }
    }

    return operations;
  } catch (error) {
    logger.error("Failed to prepare premium transfer during user merge", {
      sourceUserId,
      targetUserId,
      error,
    });
    // Keep the existing best-effort behavior for unavailable premium metadata.
    return [];
  }
}
