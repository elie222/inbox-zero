import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("user/merge-premium");

/**
 * Transfer premium subscription from source user to target user during account merge
 * This ensures premium subscriptions are preserved when accounts are merged
 */
export async function transferPremiumDuringMerge({
  sourceUserId,
  targetUserId,
}: {
  sourceUserId: string;
  targetUserId: string;
}) {
  logger.info("Starting premium transfer during user merge", {
    sourceUserId,
    targetUserId,
  });

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
    return;
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      email: true,
      premiumId: true,
      premiumAdminId: true,
    },
  });

  if (!targetUser) {
    logger.error("Target user not found", { targetUserId });
    throw new Error(`Target user ${targetUserId} not found`);
  }

  const operations: Promise<unknown>[] = [];

  // Handle premium subscription scenarios
  if (sourceUser.premiumId && targetUser.premiumId) {
    // Both users have premium - keep both premiums but prioritize source user's premium for the target
    logger.warn("Both users have premium subscriptions", {
      sourcePremiumId: sourceUser.premiumId,
      targetPremiumId: targetUser.premiumId,
      sourceUserId,
      targetUserId,
    });

    // Connect target user to source premium (they'll have access to both)
    operations.push(
      prisma.premium.update({
        where: { id: sourceUser.premiumId },
        data: {
          users: {
            connect: { id: targetUserId },
          },
        },
      }),
    );

    logger.info(
      "Target user will maintain access to both premium subscriptions",
    );
  } else if (sourceUser.premiumId && sourceUser.premium) {
    // Only source user has premium - transfer to target
    logger.info("Transferring premium subscription from source to target", {
      premiumId: sourceUser.premiumId,
      sourceUserId,
      targetUserId,
    });

    // Connect target user to source premium
    operations.push(
      prisma.premium.update({
        where: { id: sourceUser.premiumId },
        data: {
          users: {
            connect: { id: targetUserId },
          },
        },
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
      logger.warn("Target user already has premium admin rights, will merge", {
        sourcePremiumAdminId: sourceUser.premiumAdminId,
        targetPremiumAdminId: targetUser.premiumAdminId,
      });
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

  // Execute all premium transfer operations
  if (operations.length > 0) {
    logger.info("Executing premium transfer operations", {
      operationCount: operations.length,
      sourceUserId,
      targetUserId,
    });

    await Promise.all(operations);

    logger.info("Premium transfer completed successfully", {
      sourceUserId,
      targetUserId,
    });
  } else {
    logger.info("No premium to transfer", { sourceUserId, targetUserId });
  }
}
