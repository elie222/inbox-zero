import chunk from "lodash/chunk";
import { getMessageTimestamp } from "@/utils/email/message-timestamp";
import type { Logger } from "@/utils/logger";
import { isRecentOtpMessage, OTP_MAX_AGE_MS } from "@/utils/otp";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import type { ParsedMessage } from "@/utils/types";

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

export async function sendOtpPushNotification({
  emailAccountId,
  userId,
  message,
  logger,
  now = new Date(),
}: {
  emailAccountId: string;
  userId: string;
  message: ParsedMessage;
  logger: Logger;
  now?: Date;
}) {
  if (!isRecentOtpMessage(message, now)) return;

  const pushTokens = await prisma.mobilePushToken.findMany({
    where: { userId },
    select: { id: true, token: true },
  });
  if (pushTokens.length === 0) return;

  const unclaimedTokens: MobilePushToken[] = [];
  for (const pushToken of pushTokens) {
    try {
      await prisma.otpPushNotification.create({
        data: {
          emailAccountId,
          messageId: message.id,
          mobilePushTokenId: pushToken.id,
        },
      });
      unclaimedTokens.push(pushToken);
    } catch (error) {
      if (
        isDuplicateError(error, [
          "emailAccountId",
          "messageId",
          "mobilePushTokenId",
        ])
      ) {
        continue;
      }
      throw error;
    }
  }

  for (const pushTokenBatch of chunk(unclaimedTokens, EXPO_PUSH_BATCH_SIZE)) {
    await sendPushBatch({
      pushTokens: pushTokenBatch,
      emailAccountId,
      message,
      logger,
    });
  }
}

async function sendPushBatch({
  pushTokens,
  emailAccountId,
  message,
  logger,
}: {
  pushTokens: MobilePushToken[];
  emailAccountId: string;
  message: ParsedMessage;
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
          title: "Verification code",
          body: message.subject,
          sound: "default",
          channelId: "otp",
          priority: "high",
          expiration: Math.floor(
            (getMessageTimestamp(message) + OTP_MAX_AGE_MS) / 1000,
          ),
          data: {
            type: "otp",
            url: `/thread/${encodeURIComponent(message.threadId)}?accountId=${encodeURIComponent(emailAccountId)}`,
          },
        })),
      ),
    });
  } catch (error) {
    logger.warn("OTP push request outcome is unknown", { error });
    return;
  }

  if (!response.ok) {
    if (response.status === 429 || response.status >= 500) {
      await releasePushClaims({
        pushTokens,
        emailAccountId,
        messageId: message.id,
      });
    }
    logger.warn("Expo rejected OTP push request", {
      status: response.status,
    });
    return;
  }

  let tickets: ExpoPushTicket[];
  try {
    const result = (await response.json()) as {
      data?: ExpoPushTicket | ExpoPushTicket[];
    };
    tickets = Array.isArray(result.data)
      ? result.data
      : result.data
        ? [result.data]
        : [];
  } catch (error) {
    logger.warn("OTP push response outcome is unknown", { error });
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
      emailAccountId,
      messageId: message.id,
    });
  }
  if (errorCodes.size > 0) {
    logger.warn("Expo rejected OTP push notifications", {
      count: unregisteredTokenIds.length + rejectedTokens.length,
      errorCodes: [...errorCodes],
    });
  }
}

async function releasePushClaims({
  pushTokens,
  emailAccountId,
  messageId,
}: {
  pushTokens: MobilePushToken[];
  emailAccountId: string;
  messageId: string;
}) {
  await prisma.otpPushNotification.deleteMany({
    where: {
      emailAccountId,
      messageId,
      mobilePushTokenId: { in: pushTokens.map(({ id }) => id) },
    },
  });
}
