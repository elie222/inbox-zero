import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import type { ParsedMessage } from "@/utils/types";
import { isOtpSubject } from "@/utils/otp";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

type ExpoPushTicket = {
  status: "ok" | "error";
  details?: { error?: string };
};

export async function sendOtpPushNotification({
  emailAccountId,
  userId,
  message,
  logger,
}: {
  emailAccountId: string;
  userId: string;
  message: ParsedMessage;
  logger: Logger;
}) {
  if (!isOtpSubject(message.subject)) return;

  const pushTokens = await prisma.mobilePushToken.findMany({
    where: { userId },
    select: { token: true },
  });
  if (pushTokens.length === 0) return;

  try {
    await prisma.otpPushNotification.create({
      data: {
        emailAccountId,
        messageId: message.id,
      },
    });
  } catch (error) {
    if (isDuplicateError(error, ["emailAccountId", "messageId"])) return;
    throw error;
  }

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        pushTokens.map(({ token }) => ({
          to: token,
          title: "Verification code",
          body: message.subject,
          sound: "default",
          channelId: "otp",
          priority: "high",
          ttl: 15 * 60,
          data: {
            type: "otp",
            url: `/thread/${encodeURIComponent(message.threadId)}?accountId=${encodeURIComponent(emailAccountId)}`,
          },
        })),
      ),
    });
    if (!response.ok) {
      throw new Error(`Expo push request failed with ${response.status}`);
    }

    const result = (await response.json()) as {
      data?: ExpoPushTicket | ExpoPushTicket[];
    };
    const tickets = Array.isArray(result.data)
      ? result.data
      : result.data
        ? [result.data]
        : [];
    const unregisteredTokens = pushTokens.flatMap(({ token }, index) =>
      tickets[index]?.details?.error === "DeviceNotRegistered" ? [token] : [],
    );
    if (unregisteredTokens.length > 0) {
      await prisma.mobilePushToken.deleteMany({
        where: { token: { in: unregisteredTokens } },
      });
    }
  } catch (error) {
    await prisma.otpPushNotification
      .delete({
        where: {
          emailAccountId_messageId: {
            emailAccountId,
            messageId: message.id,
          },
        },
      })
      .catch(() => undefined);
    logger.warn("Failed to send OTP push notification", { error });
  }
}
