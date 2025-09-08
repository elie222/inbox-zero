import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { captureException } from "@/utils/error";
import type { EmailProvider } from "@/utils/email/types";
import { createEmailProvider } from "@/utils/email/provider";

const logger = createScopedLogger("outlook/subscription-manager");

/**
 * Manages Outlook subscriptions, ensuring only one active subscription per email account
 * by canceling old subscriptions before creating new ones.
 */
export class OutlookSubscriptionManager {
  private readonly client: EmailProvider;
  private readonly emailAccountId: string;

  constructor(client: EmailProvider, emailAccountId: string) {
    this.client = client;
    this.emailAccountId = emailAccountId;
  }

  async createSubscription() {
    try {
      logger.info("Creating new subscription", {
        emailAccountId: this.emailAccountId,
      });

      await this.cancelExistingSubscription();

      // Create new subscription
      const subscription = await this.client.watchEmails();

      logger.info("Successfully created new subscription", {
        emailAccountId: this.emailAccountId,
        subscriptionId: subscription?.subscriptionId,
      });

      return subscription;
    } catch (error) {
      logger.error("Failed to create subscription", {
        emailAccountId: this.emailAccountId,
        error,
      });
      captureException(error);
      return null;
    }
  }

  private async cancelExistingSubscription() {
    try {
      const existingSubscriptionId = await this.getExistingSubscriptionId();

      if (existingSubscriptionId) {
        logger.info("Canceling existing subscription", {
          emailAccountId: this.emailAccountId,
          existingSubscriptionId,
        });

        try {
          await this.client.unwatchEmails(existingSubscriptionId);
          logger.info("Successfully canceled existing subscription", {
            emailAccountId: this.emailAccountId,
            existingSubscriptionId,
          });
        } catch (error) {
          // Log but don't fail - the subscription might already be expired/invalid
          logger.warn(
            "Failed to cancel existing subscription (may already be expired)",
            {
              emailAccountId: this.emailAccountId,
              existingSubscriptionId,
              error: error instanceof Error ? error.message : String(error),
            },
          );
        }
      } else {
        logger.info("No existing subscription found", {
          emailAccountId: this.emailAccountId,
        });
      }
    } catch (error) {
      logger.error("Error checking for existing subscription", {
        emailAccountId: this.emailAccountId,
        error,
      });
      // Don't throw - we still want to try creating a new subscription
    }
  }

  private async getExistingSubscriptionId() {
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: this.emailAccountId },
      select: { watchEmailsSubscriptionId: true },
    });

    return emailAccount?.watchEmailsSubscriptionId || null;
  }

  async updateSubscriptionInDatabase(subscription: {
    expirationDate: Date;
    subscriptionId: string;
  }): Promise<void> {
    if (!subscription.expirationDate) {
      throw new Error("Subscription missing expiration date");
    }

    const expirationDate = subscription.expirationDate;

    await prisma.emailAccount.update({
      where: { id: this.emailAccountId },
      data: {
        watchEmailsExpirationDate: expirationDate,
        watchEmailsSubscriptionId: subscription.subscriptionId,
      },
    });

    logger.info("Updated subscription in database", {
      emailAccountId: this.emailAccountId,
      subscriptionId: subscription.subscriptionId,
      expirationDate,
    });
  }
}

export async function createManagedOutlookSubscription(emailAccountId: string) {
  const provider = await createEmailProvider({
    emailAccountId,
    provider: "microsoft",
  });
  const manager = new OutlookSubscriptionManager(provider, emailAccountId);

  const subscription = await manager.createSubscription();
  if (!subscription?.subscriptionId) {
    return null;
  }

  await manager.updateSubscriptionInDatabase({
    expirationDate: subscription.expirationDate,
    subscriptionId: subscription.subscriptionId,
  });

  return subscription.expirationDate;
}
