import { env } from "@/env";
import { sendDigestEmail } from "@inboxzero/resend";
import {
  MessagingProvider,
  MessagingRoutePurpose,
  type MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import { sendAutomationMessage } from "@/utils/automation-jobs/messaging";
import {
  DIGEST_MAX_ITEMS_PER_RULE,
  formatDigestDate,
} from "@/utils/digest/format";
import type { Logger } from "@/utils/logger";
import {
  resolveSlackRouteDestination,
  sendDigestToSlack,
} from "@/utils/messaging/providers/slack/send";
import {
  getMessagingRoute,
  getMessagingRouteWhere,
} from "@/utils/messaging/routes";
import { isMessagingChannelOperational } from "@/utils/messaging/channel-validity";
import prisma from "@/utils/prisma";

type DigestItem = { from: string; subject: string; content: string };
type ItemsByRule = Record<string, DigestItem[] | undefined>;

export async function sendDigest({
  emailAccountId,
  userEmail,
  unsubscribeToken,
  date,
  ruleNames,
  itemsByRule,
  logger,
}: {
  emailAccountId: string;
  userEmail: string;
  unsubscribeToken: string;
  date: Date;
  ruleNames: Record<string, string>;
  itemsByRule: ItemsByRule;
  logger: Logger;
}): Promise<void> {
  logger = logger.with({ emailAccountId, userEmail });

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { digestSendEmail: true },
  });

  const sendEmail = emailAccount?.digestSendEmail ?? true;

  const channels = await prisma.messagingChannel.findMany({
    where: {
      emailAccountId,
      isConnected: true,
      ...getMessagingRouteWhere(MessagingRoutePurpose.DIGESTS),
    },
    select: {
      id: true,
      provider: true,
      isConnected: true,
      accessToken: true,
      teamId: true,
      providerUserId: true,
      routes: {
        select: { purpose: true, targetType: true, targetId: true },
      },
    },
  });

  const deliveryPromises: Promise<void>[] = [];

  if (sendEmail) {
    deliveryPromises.push(
      sendDigestViaEmail({
        emailAccountId,
        userEmail,
        unsubscribeToken,
        date,
        ruleNames,
        itemsByRule,
        logger,
      }),
    );
  }

  for (const channel of channels) {
    const route = getMessagingRoute(
      channel.routes,
      MessagingRoutePurpose.DIGESTS,
    );
    if (!route) continue;
    if (!isMessagingChannelOperational(channel)) {
      logger.warn("Skipping digest delivery for invalid messaging channel", {
        messagingChannelId: channel.id,
        provider: channel.provider,
      });
      continue;
    }

    switch (channel.provider) {
      case MessagingProvider.SLACK:
        if (!channel.accessToken) continue;
        deliveryPromises.push(
          sendDigestViaSlack({
            accessToken: channel.accessToken,
            route,
            date,
            ruleNames,
            itemsByRule,
            logger,
          }),
        );
        break;
      case MessagingProvider.TEAMS:
      case MessagingProvider.TELEGRAM:
        deliveryPromises.push(
          sendDigestViaMessagingApp({
            channel,
            route,
            date,
            ruleNames,
            itemsByRule,
            logger,
          }),
        );
        break;
    }
  }

  if (deliveryPromises.length === 0) {
    if (channels.length > 0) {
      // Email is off and every configured messaging channel was skipped
      // (non-operational or missing credentials). Throw so the caller
      // doesn't mark the digest SENT and redact its items.
      throw new Error(
        "No deliverable digest channels: email delivery is disabled and all configured messaging channels are non-operational",
      );
    }
    logger.info("No delivery channels configured, skipping digest");
    return;
  }

  const results = await Promise.allSettled(deliveryPromises);
  const failures = results.filter((r) => r.status === "rejected");

  if (failures.length > 0) {
    for (const failure of failures) {
      logger.error("Digest delivery channel failed", {
        reason: (failure as PromiseRejectedResult).reason,
      });
    }

    if (failures.length === results.length) {
      throw new Error("All digest delivery channels failed");
    }
  }
}

async function sendDigestViaEmail({
  emailAccountId,
  userEmail,
  unsubscribeToken,
  date,
  ruleNames,
  itemsByRule,
  logger,
}: {
  emailAccountId: string;
  userEmail: string;
  unsubscribeToken: string;
  date: Date;
  ruleNames: Record<string, string>;
  itemsByRule: ItemsByRule;
  logger: Logger;
}) {
  logger.info("Sending digest via email");
  await sendDigestEmail({
    from: env.RESEND_FROM_EMAIL,
    to: userEmail,
    emailProps: {
      baseUrl: env.NEXT_PUBLIC_BASE_URL,
      unsubscribeToken,
      date,
      ruleNames,
      ...itemsByRule,
      emailAccountId,
    },
  });
  logger.info("Digest email sent");
}

async function sendDigestViaSlack({
  accessToken,
  route,
  date,
  ruleNames,
  itemsByRule,
  logger,
}: {
  accessToken: string;
  route: { targetId: string; targetType: MessagingRouteTargetType };
  date: Date;
  ruleNames: Record<string, string>;
  itemsByRule: ItemsByRule;
  logger: Logger;
}) {
  const destination = await resolveSlackRouteDestination({
    accessToken,
    route,
  });

  if (!destination) {
    // Throw so this counts as a channel failure in Promise.allSettled;
    // otherwise a Slack-only digest could be marked SENT without actually
    // delivering.
    throw new Error("No Slack destination resolved for digest");
  }

  logger.info("Sending digest to Slack");
  await sendDigestToSlack({
    accessToken,
    channelId: destination,
    date,
    ruleNames,
    itemsByRule,
  });
  logger.info("Digest sent to Slack");
}

async function sendDigestViaMessagingApp({
  channel,
  route,
  date,
  ruleNames,
  itemsByRule,
  logger,
}: {
  channel: {
    provider: MessagingProvider;
    accessToken: string | null;
    teamId: string | null;
    providerUserId: string | null;
  };
  route: { targetId: string; targetType: MessagingRouteTargetType };
  date: Date;
  ruleNames: Record<string, string>;
  itemsByRule: ItemsByRule;
  logger: Logger;
}) {
  logger.info("Sending digest to messaging app", {
    provider: channel.provider,
  });

  await sendAutomationMessage({
    channel,
    route,
    text: formatDigestText({ date, ruleNames, itemsByRule }),
    logger,
  });

  logger.info("Digest sent to messaging app", { provider: channel.provider });
}

function formatDigestText({
  date,
  ruleNames,
  itemsByRule,
}: {
  date: Date;
  ruleNames: Record<string, string>;
  itemsByRule: ItemsByRule;
}): string {
  const sections: string[] = [
    `📋 Your Inbox Zero digest — ${formatDigestDate(date)}`,
  ];

  for (const [ruleKey, items] of Object.entries(itemsByRule)) {
    if (!items?.length) continue;
    const displayName = ruleNames[ruleKey] ?? ruleKey;
    const visible = items.slice(0, DIGEST_MAX_ITEMS_PER_RULE);
    const overflow = items.length - visible.length;

    const lines = visible.map((item) => `- ${item.from} — ${item.subject}`);

    if (overflow > 0) lines.push(`+ ${overflow} more`);

    sections.push(`${displayName} (${items.length})\n${lines.join("\n")}`);
  }

  sections.push("Generated by Inbox Zero");
  return sections.join("\n\n");
}
