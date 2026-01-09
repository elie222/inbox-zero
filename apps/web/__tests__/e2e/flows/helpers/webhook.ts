/**
 * Webhook subscription management for E2E flow tests
 *
 * Handles setting up and tearing down webhook subscriptions
 * for test accounts to receive real webhook notifications.
 *
 * IMPORTANT: Uses the app's existing watch-manager to ensure
 * proper subscription history tracking for webhook lookups.
 */

import prisma from "@/utils/prisma";
import type { TestAccount } from "./accounts";
import { logStep } from "./logging";
import { createScopedLogger } from "@/utils/logger";
import { createManagedOutlookSubscription } from "@/utils/outlook/subscription-manager";

const logger = createScopedLogger("e2e-webhook");

/**
 * Set up webhook subscription for a test account
 *
 * Note: This uses the app's existing subscription management which will:
 * - For Gmail: Register with Google Pub/Sub
 * - For Outlook: Create Microsoft Graph subscription via subscription-manager
 *   (which properly tracks subscription history for webhook lookups)
 *
 * The webhook URL is determined by environment configuration
 * (NEXT_PUBLIC_BASE_URL or specific webhook URLs).
 */
export async function setupTestWebhookSubscription(
  account: TestAccount,
): Promise<{
  subscriptionId?: string;
  expirationDate?: Date;
}> {
  logStep("Setting up webhook subscription", {
    email: account.email,
    provider: account.provider,
  });

  try {
    let expirationDate: Date | undefined;
    let subscriptionId: string | undefined;

    if (account.provider === "microsoft") {
      // Use the managed subscription creator which handles history tracking
      const result = await createManagedOutlookSubscription({
        emailAccountId: account.id,
        logger,
      });

      if (result) {
        expirationDate = result;
        // Get the subscription ID from the database (set by subscription manager)
        const emailAccount = await prisma.emailAccount.findUnique({
          where: { id: account.id },
          select: { watchEmailsSubscriptionId: true },
        });
        subscriptionId = emailAccount?.watchEmailsSubscriptionId || undefined;
      }
    } else {
      // For Gmail, use the provider's watchEmails directly
      // (Gmail uses Pub/Sub topic which doesn't need subscription ID tracking)
      const result = await account.emailProvider.watchEmails();

      if (result) {
        expirationDate = result.expirationDate;
        subscriptionId = result.subscriptionId;

        // Update database with subscription info
        await prisma.emailAccount.update({
          where: { id: account.id },
          data: {
            watchEmailsExpirationDate: result.expirationDate,
          },
        });
      }
    }

    if (expirationDate) {
      logStep("Webhook subscription created", {
        subscriptionId,
        expirationDate,
      });

      return {
        subscriptionId,
        expirationDate,
      };
    }

    logStep("Webhook subscription returned no result");
    return {};
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : JSON.stringify(error, null, 2);
    logger.error("Failed to set up webhook subscription", {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new Error(
      `Failed to set up webhook subscription for ${account.email}: ${errorMessage}`,
    );
  }
}

/**
 * Tear down webhook subscription for a test account
 */
export async function teardownTestWebhookSubscription(
  account: TestAccount,
): Promise<void> {
  logStep("Tearing down webhook subscription", {
    email: account.email,
    provider: account.provider,
  });

  try {
    // Get current subscription ID
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: account.id },
      select: { watchEmailsSubscriptionId: true },
    });

    await account.emailProvider.unwatchEmails(
      emailAccount?.watchEmailsSubscriptionId || undefined,
    );

    // Clear subscription data in database
    await prisma.emailAccount.update({
      where: { id: account.id },
      data: {
        watchEmailsExpirationDate: null,
        watchEmailsSubscriptionId: null,
      },
    });

    logStep("Webhook subscription torn down");
  } catch (error) {
    // Log but don't throw - cleanup should be best effort
    logger.warn("Error tearing down webhook subscription", { error });
  }
}

/**
 * Verify webhook subscription is active for an account
 */
export async function verifyWebhookSubscription(
  account: TestAccount,
): Promise<boolean> {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: account.id },
    select: {
      watchEmailsExpirationDate: true,
      watchEmailsSubscriptionId: true,
    },
  });

  if (!emailAccount?.watchEmailsExpirationDate) {
    return false;
  }

  // Check if subscription has expired
  const isActive =
    new Date(emailAccount.watchEmailsExpirationDate) > new Date();

  logStep("Webhook subscription status", {
    email: account.email,
    isActive,
    expirationDate: emailAccount.watchEmailsExpirationDate,
    subscriptionId: emailAccount.watchEmailsSubscriptionId,
  });

  return isActive;
}

/**
 * Ensure webhook subscription is active and pointing to current URL
 *
 * For E2E tests, we ALWAYS re-register webhooks because:
 * - The webhook URL (ngrok) may change between runs
 * - Existing subscriptions may point to old/invalid URLs
 * - Re-registering is idempotent for Gmail (same topic)
 * - Re-registering updates the URL for Outlook
 */
export async function ensureWebhookSubscription(
  account: TestAccount,
): Promise<void> {
  logStep("Force re-registering webhook subscription for E2E test", {
    email: account.email,
    provider: account.provider,
  });

  // Always teardown and setup fresh to ensure correct URL
  await teardownTestWebhookSubscription(account);
  await setupTestWebhookSubscription(account);
}
