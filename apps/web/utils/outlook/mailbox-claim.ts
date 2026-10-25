import type { Client } from "@microsoft/microsoft-graph-client";
import type { Subscription } from "@microsoft/microsoft-graph-types";
import { NextResponse } from "next/server";
import { getOutlookClientForEmailId } from "@/utils/email-account-client";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { redis } from "@/utils/redis";
import { getOutlookNotificationUrl } from "@/utils/outlook/watch";
import { withMicrosoftGraphWriteRetry } from "@/utils/outlook/retry";

// Each self-hosted copy points its Outlook webhook at its own address, and
// Microsoft lists every webhook the app holds for the mailbox. That list is the
// only state two copies with separate databases share, so it decides which copy
// owns the mailbox. The others stand by so rules never run twice.

const CLAIM_CACHE_TTL_SECONDS = 10 * 60;

export type MailboxClaim =
  | { status: "owner" }
  | { status: "standby"; ownerHosts: string[] };

export async function checkMailboxClaim({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}): Promise<MailboxClaim> {
  const client = await getGraphClient(emailAccountId, logger);
  const subscriptions = await listLiveMessageSubscriptions(client);
  const ownUrl = getOutlookNotificationUrl().toString();

  const ownSubscriptions = subscriptions.filter(
    (subscription) => subscription.notificationUrl === ownUrl,
  );
  const otherHosts = [
    ...new Set(
      subscriptions
        .filter((subscription) => subscription.notificationUrl !== ownUrl)
        .map((subscription) => getHost(subscription.notificationUrl)),
    ),
  ];

  const claim = resolveClaim({
    ownHost: getHost(ownUrl),
    hasOwnSubscription: ownSubscriptions.length > 0,
    otherHosts,
  });

  if (claim.status === "standby" && ownSubscriptions.length > 0) {
    // Both copies held a webhook. The loser drops its own so the owner
    // stops seeing a conflict.
    logger.warn("Mailbox owned by another copy; dropping own webhook", {
      ownerHosts: claim.ownerHosts,
    });
    for (const subscription of ownSubscriptions) {
      await deleteSubscription(client, subscription.id, logger);
    }
  }

  await cacheClaim(emailAccountId, claim, logger);
  return claim;
}

export async function takeOverMailbox({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}) {
  const client = await getGraphClient(emailAccountId, logger);
  const ownUrl = getOutlookNotificationUrl().toString();
  const others = (await listLiveMessageSubscriptions(client)).filter(
    (subscription) => subscription.notificationUrl !== ownUrl,
  );

  for (const subscription of others) {
    await deleteSubscription(client, subscription.id, logger);
  }

  await cacheClaim(emailAccountId, { status: "owner" }, logger);

  return {
    releasedHosts: [...new Set(others.map((s) => getHost(s.notificationUrl)))],
  };
}

/**
 * Cron jobs act on mail without a webhook, so a copy that stands by must skip
 * them too. Returns a response to send instead when any Outlook mailbox on this
 * copy is owned elsewhere.
 */
export async function getStandbyResponse(logger: Logger) {
  const emailAccounts = await prisma.emailAccount.findMany({
    where: { account: { provider: "microsoft" } },
    select: { id: true },
  });

  for (const { id: emailAccountId } of emailAccounts) {
    const claim = await getCachedOrCheckClaim(emailAccountId, logger);
    if (claim?.status === "standby") {
      logger.warn("Skipping cron job: mailbox owned by another copy", {
        emailAccountId,
        ownerHosts: claim.ownerHosts,
      });
      return NextResponse.json({
        skipped: "standby",
        ownerHosts: claim.ownerHosts,
      });
    }
  }

  return null;
}

export function resolveClaim({
  ownHost,
  hasOwnSubscription,
  otherHosts,
}: {
  ownHost: string;
  hasOwnSubscription: boolean;
  otherHosts: string[];
}): MailboxClaim {
  if (otherHosts.length === 0) return { status: "owner" };
  if (!hasOwnSubscription) return { status: "standby", ownerHosts: otherHosts };

  // Both copies hold a webhook. Both must reach the same answer without
  // talking to each other, so the alphabetically first host keeps it.
  const sorted = [...otherHosts].sort();
  if (ownHost < sorted[0]) return { status: "owner" };
  return { status: "standby", ownerHosts: otherHosts };
}

async function getCachedOrCheckClaim(
  emailAccountId: string,
  logger: Logger,
): Promise<MailboxClaim | null> {
  try {
    const cached = await redis.get<MailboxClaim>(getClaimKey(emailAccountId));
    if (cached) return cached;
  } catch (error) {
    logger.warn("Failed to read mailbox claim cache", { error });
  }

  try {
    return await checkMailboxClaim({ emailAccountId, logger });
  } catch (error) {
    // Failing open keeps a single copy working when Microsoft is unreachable.
    logger.warn("Failed to check mailbox claim", { emailAccountId, error });
    return null;
  }
}

async function cacheClaim(
  emailAccountId: string,
  claim: MailboxClaim,
  logger: Logger,
) {
  try {
    await redis.set(getClaimKey(emailAccountId), claim, {
      ex: CLAIM_CACHE_TTL_SECONDS,
    });
  } catch (error) {
    logger.warn("Failed to cache mailbox claim", { error });
  }
}

async function getGraphClient(emailAccountId: string, logger: Logger) {
  const outlook = await getOutlookClientForEmailId({ emailAccountId, logger });
  return outlook.getClient();
}

async function listLiveMessageSubscriptions(client: Client) {
  const response: { value?: Subscription[] } = await client
    .api("/subscriptions")
    .get();
  const now = Date.now();

  return (response.value ?? []).flatMap((subscription) => {
    if (!subscription.id || !subscription.notificationUrl) return [];
    if (!isMessagesResource(subscription.resource)) return [];
    if (
      !subscription.expirationDateTime ||
      new Date(subscription.expirationDateTime).getTime() <= now
    )
      return [];
    return [
      { id: subscription.id, notificationUrl: subscription.notificationUrl },
    ];
  });
}

async function deleteSubscription(
  client: Client,
  subscriptionId: string,
  logger: Logger,
) {
  try {
    await withMicrosoftGraphWriteRetry(
      () => client.api(`/subscriptions/${subscriptionId}`).delete(),
      logger,
    );
  } catch (error) {
    logger.warn("Failed to delete Outlook subscription", {
      subscriptionId,
      error,
    });
  }
}

function isMessagesResource(resource: string | null | undefined) {
  const normalized = resource?.replace(/^\//, "").toLowerCase();
  if (!normalized) return false;
  return (
    normalized === "me/messages" || /^users\/[^/]+\/messages$/.test(normalized)
  );
}

function getHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function getClaimKey(emailAccountId: string) {
  return `outlook-mailbox-claim:${emailAccountId}`;
}
