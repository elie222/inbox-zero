import { actionClientUser } from "@/utils/actions/safe-action";
import { z } from "zod";
import {
  migrateUsersToDigestDefaults,
  getMigrationStatus,
} from "@/scripts/migrate-digest-defaults";
import { createScopedLogger } from "@/utils/logger";
import { isAdmin } from "@/utils/admin";
import { auth } from "@/utils/auth";
import { SafeError } from "@/utils/error";

const logger = createScopedLogger("digest-migration-action");

const migrationBody = z.object({
  dryRun: z.boolean().optional().default(false),
});

export const runDigestMigrationAction = actionClientUser
  .metadata({ name: "runDigestMigration" })
  .schema(migrationBody)
  .action(async ({ parsedInput, ctx }) => {
    const { dryRun = false } = parsedInput;

    // Check if user is admin
    const session = await auth();
    if (!session?.user?.email || !isAdmin({ email: session.user.email })) {
      throw new SafeError("Admin access required");
    }

    logger.info("Starting digest migration", { dryRun });

    if (dryRun) {
      // Just return status without making changes
      const status = await getMigrationStatus();
      logger.info("Dry run completed", status);
      return {
        success: true,
        dryRun: true,
        status,
        message: "Dry run completed - no changes made",
      };
    }

    try {
      const stats = await migrateUsersToDigestDefaults();

      logger.info("Migration completed successfully", stats);

      return {
        success: true,
        dryRun: false,
        stats,
        message: `Migration completed: ${stats.successfulMigrations}/${stats.totalUsers} users migrated successfully`,
      };
    } catch (error) {
      logger.error("Migration failed", { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: "Migration failed - check logs for details",
      };
    }
  });

const statusBody = z.object({});

export const getDigestMigrationStatusAction = actionClientUser
  .metadata({ name: "getDigestMigrationStatus" })
  .schema(statusBody)
  .action(async ({ ctx }) => {
    // Check if user is admin
    const session = await auth();
    if (!session?.user?.email || !isAdmin({ email: session.user.email })) {
      throw new SafeError("Admin access required");
    }

    try {
      const status = await getMigrationStatus();
      return {
        success: true,
        status,
      };
    } catch (error) {
      logger.error("Failed to get migration status", { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });
