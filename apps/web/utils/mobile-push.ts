import chunk from "lodash/chunk";
import type { MobilePushNotificationType } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_BATCH_SIZE = 100;
const EXPO_PUSH_TIMEOUT_MS = 10_000;

type ExpoPushTicket = {
  status: "ok" | "error";
  details?: { error?: string };
};

type MobilePushToken = {
  id: string;
  token: string;
};

type MobilePushNotification = {
  title: string;
  body: string;
  sound?: "default";
  channelId?: string;
  priority?: "high";
  expiration?: number;
  data?: Record<string, string>;
};

export async function sendMobilePushNotification({
  userId,
  notificationType,
  deduplicationKey,
  notification,
  logger,
}: {
  userId: string;
  notificationType: MobilePushNotificationType;
  deduplicationKey: string;
  notification: MobilePushNotification;
  logger: Logger;
}) {
  const pushTokens = await prisma.mobilePushToken.findMany({
    where: { userId },
    select: { id: true, token: true },
  });
  if (pushTokens.length === 0) return;

  const claims = await prisma.mobilePushDelivery.createManyAndReturn({
    data: pushTokens.map((pushToken) => ({
      type: notificationType,
      deduplicationKey,
      mobilePushTokenId: pushToken.id,
    })),
    select: { mobilePushTokenId: true },
    skipDuplicates: true,
  });
  const claimedTokenIds = new Set(
    claims.map(({ mobilePushTokenId }) => mobilePushTokenId),
  );
  const claimedPushTokens = pushTokens.filter(({ id }) =>
    claimedTokenIds.has(id),
  );

  for (const pushTokenBatch of chunk(claimedPushTokens, EXPO_PUSH_BATCH_SIZE)) {
    await sendPushBatch({
      pushTokens: pushTokenBatch,
      notificationType,
      deduplicationKey,
      notification,
      logger,
    });
  }
}

async function sendPushBatch({
  pushTokens,
  notificationType,
  deduplicationKey,
  notification,
  logger,
}: {
  pushTokens: MobilePushToken[];
  notificationType: MobilePushNotificationType;
  deduplicationKey: string;
  notification: MobilePushNotification;
  logger: Logger;
}) {
  let response: Response;
  try {
    response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(EXPO_PUSH_TIMEOUT_MS),
      body: JSON.stringify(
        pushTokens.map(({ token }) => ({
          to: token,
          ...notification,
        })),
      ),
    });
  } catch (error) {
    logger.warn("Mobile push request outcome is unknown", { error });
    return;
  }

  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) {
      await releasePushClaims({
        pushTokens,
        notificationType,
        deduplicationKey,
      });
    }
    logger.warn("Expo rejected mobile push request", {
      status: response.status,
    });
    return;
  }

  let tickets: ExpoPushTicket[];
  try {
    const result = (await response.json()) as {
      data?: ExpoPushTicket | ExpoPushTicket[];
    };
    if (Array.isArray(result.data)) {
      tickets = result.data;
    } else {
      tickets = result.data ? [result.data] : [];
    }
  } catch (error) {
    logger.warn("Mobile push response outcome is unknown", { error });
    return;
  }

  if (tickets.length !== pushTokens.length) {
    logger.warn("Mobile push response outcome is unknown", {
      expectedTicketCount: pushTokens.length,
      receivedTicketCount: tickets.length,
    });
    return;
  }

  const unregisteredTokenIds: string[] = [];
  const rejectedTokens: MobilePushToken[] = [];
  const errorCodes = new Set<string>();

  tickets.forEach((ticket, index) => {
    if (ticket.status !== "error") return;

    const pushToken = pushTokens[index];
    if (!pushToken) return;

    const errorCode = ticket.details?.error;
    if (errorCode) errorCodes.add(errorCode);
    if (errorCode === "DeviceNotRegistered") {
      unregisteredTokenIds.push(pushToken.id);
    } else {
      rejectedTokens.push(pushToken);
    }
  });

  if (unregisteredTokenIds.length > 0) {
    await prisma.mobilePushToken.deleteMany({
      where: { id: { in: unregisteredTokenIds } },
    });
  }
  if (rejectedTokens.length > 0) {
    await releasePushClaims({
      pushTokens: rejectedTokens,
      notificationType,
      deduplicationKey,
    });
  }
  if (errorCodes.size > 0) {
    logger.warn("Expo rejected mobile push notifications", {
      count: unregisteredTokenIds.length + rejectedTokens.length,
      errorCodes: [...errorCodes],
    });
  }
}

async function releasePushClaims({
  pushTokens,
  notificationType,
  deduplicationKey,
}: {
  pushTokens: MobilePushToken[];
  notificationType: MobilePushNotificationType;
  deduplicationKey: string;
}) {
  await prisma.mobilePushDelivery.deleteMany({
    where: {
      type: notificationType,
      deduplicationKey,
      mobilePushTokenId: { in: pushTokens.map(({ id }) => id) },
    },
  });
}
