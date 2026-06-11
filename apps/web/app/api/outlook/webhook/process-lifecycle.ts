import { createManagedOutlookSubscription } from "@/utils/outlook/subscription-manager";
import {
  backfillRecentOutlookMessages,
  getOutlookReconcileStartDate,
  OUTLOOK_RECONCILE_MAX_MESSAGES,
} from "@/utils/outlook/backfill-recent-messages";
import type { Logger } from "@/utils/logger";
import { getWebhookEmailAccount } from "@/utils/webhook/validate-webhook-account";
import type { OutlookWebhookNotification } from "@/utils/webhook/outlook/types";

export async function processOutlookLifecycleNotification({
  notification,
  logger,
}: {
  notification: Extract<
    OutlookWebhookNotification,
    { lifecycleEvent?: string | undefined }
  >;
  logger: Logger;
}) {
  if (!notification.lifecycleEvent) return;

  const emailAccount = await getWebhookEmailAccount(
    {
      watchEmailsSubscriptionId: notification.subscriptionId,
    },
    logger,
  );

  const log = logger.with({
    lifecycleEvent: notification.lifecycleEvent,
    email: emailAccount?.email,
    emailAccountId: emailAccount?.id,
  });

  if (!emailAccount) {
    log.warn(
      "Skipping Outlook lifecycle notification because account was not found",
    );
    return;
  }

  switch (notification.lifecycleEvent) {
    case "missed": {
      log.warn("Received Outlook lifecycle missed notification");
      await backfillRecentOutlookMessages({
        emailAccountId: emailAccount.id,
        emailAddress: emailAccount.email,
        subscriptionId:
          emailAccount.watchEmailsSubscriptionId || notification.subscriptionId,
        after: await getOutlookReconcileStartDate(emailAccount.id),
        maxMessages: OUTLOOK_RECONCILE_MAX_MESSAGES,
        logger: log,
      });
      return;
    }

    case "subscriptionRemoved": {
      log.warn("Received Outlook lifecycle subscription removed notification");
      const refreshed = await createManagedOutlookSubscription({
        emailAccountId: emailAccount.id,
        logger: log,
        forceRefresh: true,
      });
      await backfillRecentOutlookMessages({
        emailAccountId: emailAccount.id,
        emailAddress: emailAccount.email,
        subscriptionId: refreshed?.subscriptionId,
        after: await getOutlookReconcileStartDate(emailAccount.id),
        maxMessages: OUTLOOK_RECONCILE_MAX_MESSAGES,
        logger: log,
      });
      return;
    }

    case "reauthorizationRequired": {
      log.warn(
        "Received Outlook lifecycle reauthorization required notification",
      );
      await createManagedOutlookSubscription({
        emailAccountId: emailAccount.id,
        logger: log,
        forceRefresh: true,
      });
      return;
    }

    default:
      log.warn("Unhandled Outlook lifecycle event");
  }
}
