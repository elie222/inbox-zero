import "server-only";
import {
  ApnsEnvironment,
  MobilePushTokenType,
  type ApnsEnvironment as ApnsEnvironmentValue,
} from "@/generated/prisma/enums";
import { isApnsConfigured, deliverApnsNotifications } from "@/utils/apns";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { publishLocalMailHint } from "@/utils/redis/local-mail-hints";
import { redis } from "@/utils/redis";

const MAILBOX_PUSH_COOLDOWN_SECONDS = 20;

export async function notifyMailboxChanged({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}) {
  try {
    await publishLocalMailHint(emailAccountId, logger);
    await sendMailboxPushes({ emailAccountId, logger });
  } catch (error) {
    logger.warn("Failed to notify native mailbox clients", { error });
  }
}

async function sendMailboxPushes({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}) {
  if (!isApnsConfigured()) return;

  const acquired = await reserveMailboxPush(emailAccountId, logger);
  if (!acquired) return;

  const devices = await prisma.mobilePushToken.findMany({
    where: {
      tokenType: MobilePushTokenType.APNS,
      emailAccounts: { some: { id: emailAccountId } },
    },
    select: { token: true, environment: true },
  });
  if (devices.length === 0) return;

  const staleTokens: string[] = [];
  for (const [environment, tokens] of groupTokens(devices)) {
    const { unregisteredTokens } = await deliverApnsNotifications({
      tokens,
      ...(environment
        ? { sandbox: environment === ApnsEnvironment.SANDBOX }
        : {}),
      notification: {
        pushType: "background",
        data: { emailAccountId, hint: "mailbox" },
      },
      logger,
    });
    staleTokens.push(...unregisteredTokens);
  }

  const rejectedTokens = [...new Set(staleTokens)];
  if (rejectedTokens.length === 0) return;
  await prisma.mobilePushToken.deleteMany({
    where: { token: { in: rejectedTokens } },
  });
  logger.info("Pruned rejected mailbox push tokens", {
    count: rejectedTokens.length,
  });
}

async function reserveMailboxPush(emailAccountId: string, logger: Logger) {
  try {
    const acquired = await redis.set(
      `mailbox-push-cooldown:${emailAccountId}`,
      "1",
      { nx: true, ex: MAILBOX_PUSH_COOLDOWN_SECONDS },
    );
    return Boolean(acquired);
  } catch (error) {
    logger.warn("Mailbox push cooldown check failed", { error });
    return true;
  }
}

function groupTokens(
  devices: Array<{
    token: string;
    environment: ApnsEnvironmentValue | null;
  }>,
) {
  const grouped = new Map<ApnsEnvironmentValue | null, string[]>();
  for (const device of devices) {
    const tokens = grouped.get(device.environment) ?? [];
    tokens.push(device.token);
    grouped.set(device.environment, tokens);
  }
  return grouped;
}
