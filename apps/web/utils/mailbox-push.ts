import "server-only";
import { MobilePushTokenType } from "@/generated/prisma/enums";
import { isApnsConfigured, deliverApnsNotifications } from "@/utils/apns";
import { deliverFcmNotifications, isFcmConfigured } from "@/utils/fcm";
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
  const tokenTypes = [
    ...(isApnsConfigured() ? [MobilePushTokenType.APNS] : []),
    ...(isFcmConfigured() ? [MobilePushTokenType.FCM] : []),
  ];
  if (tokenTypes.length === 0) return;

  const acquired = await reserveMailboxPush(emailAccountId, logger);
  if (!acquired) return;

  const account = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      user: {
        select: {
          mobilePushTokens: {
            where: { tokenType: { in: tokenTypes } },
            select: { token: true, tokenType: true },
          },
        },
      },
    },
  });
  const devices = account?.user.mobilePushTokens ?? [];
  if (devices.length === 0) return;

  const notification = {
    pushType: "background" as const,
    data: { emailAccountId, hint: "mailbox" },
  };
  const tokensOf = (tokenType: MobilePushTokenType) =>
    devices
      .filter((device) => device.tokenType === tokenType)
      .map((device) => device.token);
  const [apns, fcm] = await Promise.all([
    deliverApnsNotifications({
      tokens: tokensOf(MobilePushTokenType.APNS),
      notification,
      logger,
    }),
    deliverFcmNotifications({
      tokens: tokensOf(MobilePushTokenType.FCM),
      notification,
      logger,
    }),
  ]);

  const rejectedTokens = [
    ...new Set([...apns.unregisteredTokens, ...fcm.unregisteredTokens]),
  ];
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
