import { createScopedLogger } from "@/utils/logger";
import {
  fixCorruptedTokens,
  shouldRunTokenCleanup,
} from "@/utils/migration/fix-encrypted-tokens";

const logger = createScopedLogger("startup");

/**
 * Run startup migrations and health checks
 * This should be called when the application starts
 */
export async function runStartupMigrations() {
  logger.info("Running startup migrations...");

  try {
    // Check if token cleanup is needed
    const needsCleanup = await shouldRunTokenCleanup();

    if (needsCleanup) {
      logger.info(
        "Detected potential corrupted tokens from NextAuth migration, running cleanup...",
      );
      const result = await fixCorruptedTokens();
      logger.info("Token cleanup completed", {
        fixed: result.fixed,
        total: result.total,
        message:
          result.fixed > 0
            ? "Users with affected tokens will need to re-authenticate on next login"
            : "No corrupted tokens found",
      });
    } else {
      logger.info(
        "Token cleanup not needed - accounts appear to be using Better-Auth format",
      );
    }
  } catch (error) {
    logger.error("Error during startup migrations", { error });
    // Don't throw - we want the app to start even if migrations fail
  }

  logger.info("Startup migrations completed");
}
