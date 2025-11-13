import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { captureException } from "@/utils/error";
import type { EmailProvider } from "@/utils/email/types";
import { createEmailProvider } from "@/utils/email/provider";
import type { Logger } from "@/utils/logger";
import {
  parseSubscriptionHistory,
  cleanupOldHistoryEntries,
  addCurrentSubscriptionToHistory,
} from "@/utils/outlook/subscription-history";

/**
 * Manages Outlook subscriptions, ensuring only one active subscription per email account
 * by canceling old subscriptions before creating new ones.
 */
export class OutlookSubscriptionManager {
  private readonly client: EmailProvider;
  private readonly emailAccountId: string;
  private readonly logger: Logger;

  constructor(client: EmailProvider, emailAccountId: string) {
    this.client = client;
    this.emailAccountId = emailAccountId;
    this.logger = createScopedLogger("outlook/subscription-manager").with({
      emailAccountId,
    });
  }

  async createSubscription(): Promise<{
    expirationDate: Date;
    subscriptionId?: string;
    changed: boolean;
  } | null> {
    try {
      // Check if we already have a valid subscription and reuse it when possible
      const existing = await this.getExistingSubscription();

      if (existing?.subscriptionId && existing.expirationDate) {
        const now = new Date();
        const renewalThresholdMs = 24 * 60 * 60 * 1000; // 24 hours
        const timeUntilExpiry =
          new Date(existing.expirationDate).getTime() - now.getTime();

        if (timeUntilExpiry > renewalThresholdMs) {
          this.logger.info("Existing subscription is valid; reuse", {
            subscriptionId: existing.subscriptionId,
            expirationDate: existing.expirationDate,
          });
          return {
            expirationDate: new Date(existing.expirationDate),
            subscriptionId: existing.subscriptionId,
            changed: false,
          };
        }

        this.logger.info("Existing subscription near expiry; renewing", {
          subscriptionId: existing.subscriptionId,
          expirationDate: existing.expirationDate,
        });
      } else {
        this.logger.info("No existing subscription found; creating new");
      }

      // If we got here, the subscription is missing or expiring soon. Cancel and create a new one.
      await this.cancelExistingSubscription();

      const subscription = await this.client.watchEmails();

      this.logger.info("Successfully created new subscription", {
        subscriptionId: subscription?.subscriptionId,
      });

      return subscription
        ? {
            expirationDate: subscription.expirationDate,
            subscriptionId: subscription.subscriptionId,
            changed: true,
          }
        : null;
    } catch (error) {
      this.logger.error("Failed to create subscription", { error });
      captureException(error);
      return null;
    }
  }

  /**
   * Ensures there is a valid subscription and persists it only when changed.
   * Returns the active subscription expiration date or null on failure.
   */
  async ensureSubscription(): Promise<Date | null> {
    const result = await this.createSubscription();
    if (!result?.subscriptionId) return null;

    if (result.changed) {
      try {
        await this.updateSubscriptionInDatabase({
          expirationDate: result.expirationDate,
          subscriptionId: result.subscriptionId,
        });
      } catch (error) {
        this.logger.error("Failed to save subscription to database", {
          subscriptionId: result.subscriptionId,
          error,
        });

        try {
          await this.client.unwatchEmails(result.subscriptionId);
          this.logger.info("Canceled orphaned subscription after DB failure", {
            subscriptionId: result.subscriptionId,
          });
        } catch (cancelError) {
          this.logger.error("Failed to cancel orphaned subscription", {
            subscriptionId: result.subscriptionId,
            error: cancelError,
          });
        }

        captureException(error);
        return null;
      }
    }

    return result.expirationDate;
  }

  private async cancelExistingSubscription() {
    try {
      const existing = await this.getExistingSubscription();
      const existingSubscriptionId = existing?.subscriptionId || null;

      if (existingSubscriptionId) {
        this.logger.info("Canceling existing subscription", {
          existingSubscriptionId,
        });

        try {
          await this.client.unwatchEmails(existingSubscriptionId);
          this.logger.info("Successfully canceled existing subscription", {
            existingSubscriptionId,
          });
        } catch (error) {
          // Log but don't fail - the subscription might already be expired/invalid
          this.logger.warn(
            "Failed to cancel existing subscription (may already be expired)",
            {
              existingSubscriptionId,
              error: error instanceof Error ? error.message : String(error),
            },
          );
        }
      } else {
        this.logger.info("No existing subscription found");
      }
    } catch (error) {
      this.logger.error("Error checking for existing subscription", { error });
      // Don't throw - we still want to try creating a new subscription
    }
  }

  private async getExistingSubscription() {
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: this.emailAccountId },
      select: {
        watchEmailsSubscriptionId: true,
        watchEmailsExpirationDate: true,
        watchEmailsSubscriptionHistory: true,
        createdAt: true,
      },
    });

    if (!emailAccount) return null;

    return {
      subscriptionId: emailAccount.watchEmailsSubscriptionId || null,
      expirationDate: emailAccount.watchEmailsExpirationDate || null,
      subscriptionHistory: emailAccount.watchEmailsSubscriptionHistory,
      accountCreatedAt: emailAccount.createdAt,
    };
  }

  async updateSubscriptionInDatabase(subscription: {
    expirationDate: Date;
    subscriptionId: string;
  }): Promise<void> {
    if (!subscription.expirationDate) {
      throw new Error("Subscription missing expiration date");
    }

    const expirationDate = subscription.expirationDate;
    const now = new Date();

    this.logger.info("Updating subscription in database", {
      subscriptionId: subscription.subscriptionId,
      expirationDate,
    });

    const existing = await this.getExistingSubscription();

    let updatedHistory = parseSubscriptionHistory(
      existing?.subscriptionHistory,
      this.logger,
    );
    updatedHistory = cleanupOldHistoryEntries(updatedHistory);

    if (
      existing?.subscriptionId &&
      existing.subscriptionId !== subscription.subscriptionId
    ) {
      updatedHistory = addCurrentSubscriptionToHistory(
        updatedHistory,
        existing.subscriptionId,
        now,
        existing.accountCreatedAt,
        this.logger,
      );

      this.logger.info("Moving old subscription to history", {
        oldSubscriptionId: existing.subscriptionId,
        newSubscriptionId: subscription.subscriptionId,
        historyLength: updatedHistory.length,
      });
    }

    await prisma.emailAccount.update({
      where: { id: this.emailAccountId },
      data: {
        watchEmailsExpirationDate: expirationDate,
        watchEmailsSubscriptionId: subscription.subscriptionId,
        watchEmailsSubscriptionHistory: updatedHistory,
      },
    });

    this.logger.info("Updated subscription in database", {
      subscriptionId: subscription.subscriptionId,
      expirationDate,
      historyEntries: updatedHistory.length,
    });
  }
}

export async function createManagedOutlookSubscription(
  emailAccountId: string,
): Promise<Date | null> {
  const provider = await createEmailProvider({
    emailAccountId,
    provider: "microsoft",
  });
  const manager = new OutlookSubscriptionManager(provider, emailAccountId);

  return await manager.ensureSubscription();
}
