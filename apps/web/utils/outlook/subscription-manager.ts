import prisma from "@/utils/prisma";
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

  constructor(client: EmailProvider, emailAccountId: string, logger: Logger) {
    this.client = client;
    this.emailAccountId = emailAccountId;
    this.logger = logger.with({ emailAccountId });
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
      captureException(error, { emailAccountId: this.emailAccountId });
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

        captureException(error, { emailAccountId: this.emailAccountId });
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
              error,
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

    // Check if we were immediately overwritten by a concurrent call
    const current = await this.getExistingSubscription();
    if (current?.subscriptionId !== subscription.subscriptionId) {
      this.logger.warn(
        "Detected concurrent subscription update, ensuring our subscription is in history",
        {
          ourSubscriptionId: subscription.subscriptionId,
          currentSubscriptionId: current?.subscriptionId,
        },
      );
      await this.addSubscriptionToHistoryIfMissing(
        subscription.subscriptionId,
        now,
        existing?.accountCreatedAt || now,
      );
    }
  }

  /**
   * Atomically adds a subscription to the history array if it's not already the current one
   * and not already in the history. This handles the case where we were overwritten
   * by a concurrent call before we could finish our update.
   */
  private async addSubscriptionToHistoryIfMissing(
    subscriptionId: string,
    replacedAt: Date,
    accountCreatedAt: Date,
  ): Promise<void> {
    const historyEntry = {
      subscriptionId,
      createdAt: accountCreatedAt.toISOString(),
      replacedAt: replacedAt.toISOString(),
    };

    // Use a raw query to atomically append to the JSONB array only if the subscriptionId
    // isn't already the main one AND isn't already in the history array.
    await prisma.$executeRaw`
      UPDATE "EmailAccount"
      SET "watchEmailsSubscriptionHistory" = 
        COALESCE("watchEmailsSubscriptionHistory", '[]'::jsonb) || ${JSON.stringify([historyEntry])}::jsonb
      WHERE id = ${this.emailAccountId}
        AND "watchEmailsSubscriptionId" != ${subscriptionId}
        AND NOT (
          COALESCE("watchEmailsSubscriptionHistory", '[]'::jsonb) @> ${JSON.stringify([{ subscriptionId }])}::jsonb
        )
    `;
  }
}

export async function createManagedOutlookSubscription({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}): Promise<Date | null> {
  const provider = await createEmailProvider({
    emailAccountId,
    provider: "microsoft",
    logger,
  });
  const manager = new OutlookSubscriptionManager(
    provider,
    emailAccountId,
    logger,
  );

  return await manager.ensureSubscription();
}
