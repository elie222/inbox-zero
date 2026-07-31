import prisma from "@/utils/prisma";

export const OTP_PUSH_RETENTION_MS = 24 * 60 * 60 * 1000;

export async function deleteExpiredOtpPushNotifications(
  now = new Date(),
): Promise<number> {
  const result = await prisma.otpPushNotification.deleteMany({
    where: {
      createdAt: {
        lt: new Date(now.getTime() - OTP_PUSH_RETENTION_MS),
      },
    },
  });

  return result.count;
}
