import chunk from "lodash/chunk";
import { MobilePushTokenType } from "@/generated/prisma/enums";
import {
  deliverApnsNotifications,
  isFakeApnsTransport,
  takeRecordedApnsSends,
} from "@/utils/apns";
import {
  deliverFcmNotifications,
  isFakeFcmTransport,
  takeRecordedFcmSends,
} from "@/utils/fcm";
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
  tokenType: MobilePushTokenType | null;
};

type MobilePushNotification = {
  title: string;
  subtitle?: string;
  body: string;
  sound?: "default";
  channelId?: string;
  priority?: "high";
  expiration?: number;
  data?: Record<string, string>;
};

export async function sendMobilePushNotification({
  userId,
  deduplicationKey,
  notification,
  logger,
}: {
  userId: string;
  deduplicationKey: string;
  notification: MobilePushNotification;
  logger: Logger;
}) {
  const pushTokens = await prisma.mobilePushToken.findMany({
    where: { userId },
    select: { id: true, token: true, tokenType: true },
  });
  if (pushTokens.length === 0) return;

  const claims = await prisma.mobilePushDelivery.createManyAndReturn({
    data: pushTokens.map((pushToken) => ({
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

  const expoTokens = claimedPushTokens.filter(
    (pushToken) =>
      pushToken.tokenType !== MobilePushTokenType.APNS &&
      pushToken.tokenType !== MobilePushTokenType.FCM,
  );
  const apnsTokens = claimedPushTokens.filter(
    (pushToken) => pushToken.tokenType === MobilePushTokenType.APNS,
  );
  const fcmTokens = claimedPushTokens.filter(
    (pushToken) => pushToken.tokenType === MobilePushTokenType.FCM,
  );

  for (const pushTokenBatch of chunk(expoTokens, EXPO_PUSH_BATCH_SIZE)) {
    await sendPushBatch({
      pushTokens: pushTokenBatch,
      deduplicationKey,
      notification,
      logger,
    });
  }

  if (apnsTokens.length > 0) {
    await sendNativeBatch({
      pushTokens: apnsTokens,
      deduplicationKey,
      deliver: (tokens) =>
        deliverApnsNotifications({ tokens, notification, logger }),
    });
  }

  if (fcmTokens.length > 0) {
    await sendNativeBatch({
      pushTokens: fcmTokens,
      deduplicationKey,
      deliver: (tokens) =>
        deliverFcmNotifications({ tokens, notification, logger }),
    });
  }
}

export function isFakePushTransport() {
  return isFakeApnsTransport() || isFakeFcmTransport();
}

export function takeRecordedPushSends() {
  return [
    ...takeRecordedApnsSends().map((send) => ({
      type: "apns" as const,
      ...send,
    })),
    ...takeRecordedFcmSends().map((send) => ({
      type: "fcm" as const,
      ...send,
    })),
  ];
}

async function sendNativeBatch({
  pushTokens,
  deduplicationKey,
  deliver,
}: {
  pushTokens: MobilePushToken[];
  deduplicationKey: string;
  deliver: (
    tokens: string[],
  ) => Promise<{ unregisteredTokens: string[]; retryTokens: string[] }>;
}) {
  const { unregisteredTokens, retryTokens } = await deliver(
    pushTokens.map(({ token }) => token),
  );
  const unregisteredIds = pushTokens
    .filter((pushToken) => unregisteredTokens.includes(pushToken.token))
    .map(({ id }) => id);
  const retryIds = pushTokens.filter((pushToken) =>
    retryTokens.includes(pushToken.token),
  );
  if (unregisteredIds.length > 0) {
    await prisma.mobilePushToken.deleteMany({
      where: { id: { in: unregisteredIds } },
    });
  }
  if (retryIds.length > 0) {
    await releasePushClaims({
      pushTokens: retryIds,
      deduplicationKey,
    });
  }
}

async function sendPushBatch({
  pushTokens,
  deduplicationKey,
  notification,
  logger,
}: {
  pushTokens: MobilePushToken[];
  deduplicationKey: string;
  notification: MobilePushNotification;
  logger: Logger;
}) {
  const { subtitle, ...expoNotification } = notification;
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
          ...expoNotification,
          body: subtitle
            ? `${subtitle}\n${notification.body}`
            : notification.body,
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
  deduplicationKey,
}: {
  pushTokens: MobilePushToken[];
  deduplicationKey: string;
}) {
  await prisma.mobilePushDelivery.deleteMany({
    where: {
      deduplicationKey,
      mobilePushTokenId: { in: pushTokens.map(({ id }) => id) },
    },
  });
}
