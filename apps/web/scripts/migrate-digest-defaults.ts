import { PrismaClient, ActionType, SystemType } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";

const prisma = new PrismaClient();
const logger = createScopedLogger("digest-migration");

// Categories that should have digest enabled by default
const DEFAULT_DIGEST_CATEGORIES = [
  "Newsletter",
  "Receipt",
  "Calendar",
  "Notification",
  "To Reply",
] as const;

type DefaultDigestCategory = (typeof DEFAULT_DIGEST_CATEGORIES)[number];

interface MigrationStats {
  totalUsers: number;
  processedUsers: number;
  successfulMigrations: number;
  skippedUsers: number;
  failedUsers: number;
  rulesUpdated: number;
  errors: Array<{ userId: string; error: string }>;
  [key: string]: unknown; // Add index signature for logging
}

/**
 * Phase 1: Safe Migration Script
 *
 * This script enables digest for default categories for existing users
 * who haven't customized their rules extensively.
 */
export async function migrateUsersToDigestDefaults(): Promise<MigrationStats> {
  logger.info("Starting digest migration for default categories");

  const stats: MigrationStats = {
    totalUsers: 0,
    processedUsers: 0,
    successfulMigrations: 0,
    skippedUsers: 0,
    failedUsers: 0,
    rulesUpdated: 0,
    errors: [],
  };

  try {
    // Find users who haven't been migrated yet
    const users = await prisma.emailAccount.findMany({
      where: {
        digestMigrationCompleted: false,
        // Only migrate users who have the default system rules
        rules: {
          some: {
            systemType: {
              in: [
                SystemType.NEWSLETTER,
                SystemType.RECEIPT,
                SystemType.CALENDAR,
                SystemType.NOTIFICATION,
                SystemType.TO_REPLY,
              ],
            },
          },
        },
      } as any,
      include: {
        rules: {
          include: {
            actions: true,
          },
        },
      },
      // Process in batches to avoid memory issues
      take: 1000,
    });

    stats.totalUsers = users.length;
    logger.info(`Found ${stats.totalUsers} users to migrate`);

    if (stats.totalUsers === 0) {
      logger.info("No users found for migration");
      return stats;
    }

    // Process each user
    for (const user of users) {
      stats.processedUsers++;

      try {
        const result = await migrateUserDigestDefaults({
          id: user.id,
          rules: (user as any).rules.map((rule: any) => ({
            id: rule.id,
            name: rule.name,
            systemType: rule.systemType,
            actions: rule.actions.map((action: any) => ({ type: action.type })),
          })),
        });

        if (result.success) {
          stats.successfulMigrations++;
          stats.rulesUpdated += result.rulesUpdated;

          // Mark user as migrated
          await markUserMigrated(user.id);

          logger.info(`Successfully migrated user ${user.id}`, {
            rulesUpdated: result.rulesUpdated,
            categories: result.categoriesUpdated,
          });
        } else {
          stats.skippedUsers++;
          logger.info(`Skipped user ${user.id}: ${result.reason}`);
        }
      } catch (error) {
        stats.failedUsers++;
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        stats.errors.push({ userId: user.id, error: errorMessage });

        logger.error(`Failed to migrate user ${user.id}`, { error });
        // Continue with next user instead of failing entire migration
      }
    }

    logger.info("Migration completed", stats);
    return stats;
  } catch (error) {
    logger.error("Migration failed", { error });
    throw error;
  }
}

interface UserMigrationResult {
  success: boolean;
  reason?: string;
  rulesUpdated: number;
  categoriesUpdated: string[];
}

/**
 * Migrate a single user's digest defaults
 */
async function migrateUserDigestDefaults(user: {
  id: string;
  rules: Array<{
    id: string;
    name: string;
    systemType: SystemRule | null;
    actions: Array<{ type: ActionType }>;
  }>;
}): Promise<UserMigrationResult> {
  const categoriesUpdated: string[] = [];
  let rulesUpdated = 0;

  // Check if user has heavily customized their rules
  const hasCustomRules = user.rules.some(
    (rule) =>
      !rule.systemType &&
      !DEFAULT_DIGEST_CATEGORIES.includes(rule.name as DefaultDigestCategory),
  );

  if (hasCustomRules) {
    return {
      success: false,
      reason: "User has custom rules, skipping to avoid conflicts",
      rulesUpdated: 0,
      categoriesUpdated: [],
    };
  }

  // Process each default category
  for (const categoryName of DEFAULT_DIGEST_CATEGORIES) {
    const rule = user.rules.find((r) => r.name === categoryName);

    if (!rule) {
      logger.warn(`User ${user.id} missing rule for category: ${categoryName}`);
      continue;
    }

    // Check if digest is already enabled
    const hasDigest = rule.actions.some(
      (action) => action.type === ActionType.DIGEST,
    );

    if (hasDigest) {
      logger.info(
        `User ${user.id} already has digest enabled for ${categoryName}`,
      );
      continue;
    }

    // Enable digest for this category
    try {
      await prisma.action.create({
        data: {
          ruleId: rule.id,
          type: ActionType.DIGEST,
        },
      });

      categoriesUpdated.push(categoryName);
      rulesUpdated++;

      logger.info(
        `Enabled digest for user ${user.id}, category: ${categoryName}`,
      );
    } catch (error) {
      logger.error(
        `Failed to enable digest for user ${user.id}, category: ${categoryName}`,
        { error },
      );
      throw error; // Re-throw to be caught by caller
    }
  }

  return {
    success: true,
    rulesUpdated,
    categoriesUpdated,
  };
}

/**
 * Mark a user as having completed the digest migration
 */
async function markUserMigrated(userId: string): Promise<void> {
  await prisma.emailAccount.update({
    where: { id: userId },
    data: { digestMigrationCompleted: true },
  } as any);
}

/**
 * Rollback migration for a specific user (for testing/debugging)
 */
export async function rollbackUserMigration(userId: string): Promise<void> {
  logger.info(`Rolling back migration for user ${userId}`);

  // Find digest actions created during migration
  const digestActions = await prisma.action.findMany({
    where: {
      type: ActionType.DIGEST,
      rule: {
        emailAccountId: userId,
        name: { in: [...DEFAULT_DIGEST_CATEGORIES] },
      },
    },
  });

  // Delete the digest actions
  await prisma.action.deleteMany({
    where: {
      id: { in: digestActions.map((a) => a.id) },
    },
  });

  // Mark user as not migrated
  await prisma.emailAccount.update({
    where: { id: userId },
    data: { digestMigrationCompleted: false },
  } as any);

  logger.info(
    `Rolled back ${digestActions.length} digest actions for user ${userId}`,
  );
}

/**
 * Get migration status for all users
 */
export async function getMigrationStatus() {
  const totalUsers = await prisma.emailAccount.count();
  const migratedUsers = await prisma.emailAccount.count({
    where: { digestMigrationCompleted: true },
  } as any);
  const pendingUsers = totalUsers - migratedUsers;

  return {
    totalUsers,
    migratedUsers,
    pendingUsers,
    migrationProgress: totalUsers > 0 ? (migratedUsers / totalUsers) * 100 : 0,
  };
}

// CLI execution
if (require.main === module) {
  migrateUsersToDigestDefaults()
    .then((stats) => {
      console.log("Migration completed successfully:", stats);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration failed:", error);
      process.exit(1);
    })
    .finally(() => {
      prisma.$disconnect();
    });
}
