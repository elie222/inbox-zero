import prisma from "@/utils/prisma";

export const MOBILE_PUSH_RETENTION_MS = 24 * 60 * 60 * 1000;

export async function deleteExpiredMobilePushDeliveries(
  now = new Date(),
): Promise<number> {
  const result = await prisma.mobilePushDelivery.deleteMany({
    where: {
      createdAt: {
        lt: new Date(now.getTime() - MOBILE_PUSH_RETENTION_MS),
      },
    },
  });

  return result.count;
}
