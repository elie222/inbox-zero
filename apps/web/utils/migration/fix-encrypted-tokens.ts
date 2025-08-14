import prisma from "@/utils/prisma";
import { decryptToken } from "@/utils/encryption";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("token-migration");

/**
 * Automatically fixes corrupted/undecryptable tokens by clearing them.
 * This allows users to re-authenticate without admin intervention.
 * Should be called during app startup or as a maintenance script.
 */
export async function fixCorruptedTokens() {
  logger.info("Starting corrupted token cleanup...");

  try {
    // Find all accounts with tokens
    const accounts = await prisma.account.findMany({
      where: {
        OR: [{ access_token: { not: null } }, { refresh_token: { not: null } }],
      },
      select: {
        id: true,
        userId: true,
        provider: true,
        access_token: true,
        refresh_token: true,
      },
    });

    logger.info(`Found ${accounts.length} accounts with tokens to check`);

    const corruptedAccounts = [];

    for (const account of accounts) {
      let hasCorruptedTokens = false;

      // Test if access_token can be decrypted
      if (account.access_token) {
        const decryptedAccess = decryptToken(account.access_token);
        if (decryptedAccess === null) {
          hasCorruptedTokens = true;
          logger.warn(
            `Corrupted access_token found for account ${account.id} (${account.provider})`,
          );
        }
      }

      // Test if refresh_token can be decrypted
      if (account.refresh_token) {
        const decryptedRefresh = decryptToken(account.refresh_token);
        if (decryptedRefresh === null) {
          hasCorruptedTokens = true;
          logger.warn(
            `Corrupted refresh_token found for account ${account.id} (${account.provider})`,
          );
        }
      }

      if (hasCorruptedTokens) {
        corruptedAccounts.push(account);
      }
    }

    if (corruptedAccounts.length === 0) {
      logger.info("No corrupted tokens found");
      return { fixed: 0, total: accounts.length };
    }

    logger.info(
      `Found ${corruptedAccounts.length} accounts with corrupted tokens, clearing them...`,
    );

    // Clear corrupted tokens so users can re-authenticate
    const updatePromises = corruptedAccounts.map((account) =>
      prisma.account.update({
        where: { id: account.id },
        data: {
          access_token: null,
          refresh_token: null,
          // Also clear old expires_at if it exists
          expires_at: null,
        },
      }),
    );

    await Promise.all(updatePromises);

    logger.info(
      `Successfully cleared corrupted tokens for ${corruptedAccounts.length} accounts`,
    );
    logger.info(
      "Users will need to re-authenticate, but this will happen automatically on next login attempt",
    );

    return {
      fixed: corruptedAccounts.length,
      total: accounts.length,
      corruptedAccountIds: corruptedAccounts.map((a) => a.id),
    };
  } catch (error) {
    logger.error("Error during token cleanup", { error });
    throw error;
  }
}

/**
 * Check if automatic token cleanup should run
 * Only runs once per deployment to avoid unnecessary processing
 */
export async function shouldRunTokenCleanup(): Promise<boolean> {
  try {
    // Check if we have any accounts with the new Better-Auth fields populated
    const betterAuthAccounts = await prisma.account.count({
      where: {
        OR: [
          { accessTokenExpiresAt: { not: null } },
          { refreshTokenExpiresAt: { not: null } },
        ],
      },
    });

    // Check total accounts with tokens
    const totalAccountsWithTokens = await prisma.account.count({
      where: {
        OR: [{ access_token: { not: null } }, { refresh_token: { not: null } }],
      },
    });

    // If we have accounts with tokens but none with Better-Auth fields,
    // we likely need to run cleanup
    const needsCleanup =
      totalAccountsWithTokens > 0 && betterAuthAccounts === 0;

    if (needsCleanup) {
      logger.info(
        `Found ${totalAccountsWithTokens} accounts with old tokens, ${betterAuthAccounts} with new format`,
      );
    }

    return needsCleanup;
  } catch (error) {
    logger.error("Error checking if token cleanup should run", { error });
    return false;
  }
}
