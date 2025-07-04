import type { Client } from "@microsoft/microsoft-graph-client";
import prisma from "@/utils/prisma";
import { getOutlookClientWithRefresh } from "@/utils/outlook/client";
import { captureException } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { watchOutlook, unwatchOutlook } from "@/utils/outlook/watch";

const logger = createScopedLogger("outlook/watch");

export async function watchEmails({
  emailAccountId,
  client,
}: {
  emailAccountId: string;
  client: Client;
}) {
  logger.info("Watching emails", { emailAccountId });
  const subscription = await watchOutlook(client);

  if (subscription.expirationDateTime) {
    const expirationDate = new Date(subscription.expirationDateTime);
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: {
        watchEmailsExpirationDate: expirationDate,
        watchEmailsSubscriptionId: subscription.id,
      },
    });
    return expirationDate;
  }
  logger.error("Error watching inbox", { emailAccountId });
}

export async function unwatchEmails({
  emailAccountId,
  accessToken,
  refreshToken,
  expiresAt,
  subscriptionId,
}: {
  emailAccountId: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  subscriptionId: string | null;
}) {
  try {
    logger.info("Unwatching emails", { emailAccountId });
    if (!subscriptionId) {
      logger.warn("No subscription ID found", { emailAccountId });
      return;
    }

    const client = await getOutlookClientWithRefresh({
      accessToken,
      refreshToken,
      expiresAt,
      emailAccountId,
    });

    await unwatchOutlook(client.getClient(), subscriptionId);
  } catch (error) {
    if (error instanceof Error && error.message.includes("invalid_grant")) {
      logger.warn("Error unwatching emails, invalid grant", { emailAccountId });
      return;
    }

    logger.error("Error unwatching emails", { emailAccountId, error });
    captureException(error);
  }

  await prisma.emailAccount.update({
    where: { id: emailAccountId },
    data: {
      watchEmailsExpirationDate: null,
      watchEmailsSubscriptionId: null,
    },
  });
}
