import prisma from "@/utils/prisma";
import { captureException } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import type { EmailProvider } from "@/utils/email/types";
import { createManagedOutlookSubscription } from "@/utils/outlook/subscription-manager";
import { isMicrosoftProvider } from "@/utils/email/provider-types";

const logger = createScopedLogger("watch/controller");

export async function watchEmails({
  emailAccountId,
  provider,
}: {
  emailAccountId: string;
  provider: EmailProvider;
}): Promise<
  { success: true; expirationDate: Date } | { success: false; error: string }
> {
  logger.info("Watching emails", {
    emailAccountId,
    providerName: provider.name,
  });

  try {
    if (isMicrosoftProvider(provider.name)) {
      const result = await createManagedOutlookSubscription(emailAccountId);

      if (result) return { success: true, expirationDate: result };
    } else {
      const result = await provider.watchEmails();

      if (result) {
        await prisma.emailAccount.update({
          where: { id: emailAccountId },
          data: { watchEmailsExpirationDate: result.expirationDate },
        });
        return { success: true, expirationDate: result.expirationDate };
      }
    }

    const errorMessage = "Provider returned no result for watch setup";
    logger.error("Error watching inbox", {
      emailAccountId,
      providerName: provider.name,
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Error watching inbox", {
      emailAccountId,
      providerName: provider.name,
      error,
    });
    captureException(error);
    return { success: false, error: errorMessage };
  }
}

export async function unwatchEmails({
  emailAccountId,
  provider,
  subscriptionId,
}: {
  emailAccountId: string;
  provider: EmailProvider;
  subscriptionId?: string | null;
}) {
  try {
    logger.info("Unwatching emails", {
      emailAccountId,
      providerName: provider.name,
    });

    await provider.unwatchEmails(subscriptionId || undefined);
  } catch (error) {
    if (error instanceof Error && error.message.includes("invalid_grant")) {
      logger.warn("Error unwatching emails, invalid grant", {
        emailAccountId,
        providerName: provider.name,
      });
      return;
    }

    logger.error("Error unwatching emails", {
      emailAccountId,
      providerName: provider.name,
      error,
    });
    captureException(error);
  }

  // Clear the watch data regardless of provider
  await prisma.emailAccount.update({
    where: { id: emailAccountId },
    data: {
      watchEmailsExpirationDate: null,
      watchEmailsSubscriptionId: null,
    },
  });
}
