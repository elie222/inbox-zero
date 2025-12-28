import prisma from "@/utils/prisma";
import type { VolumeStats } from "../types";

export async function computeVolumeStats(
  emailAccountId: string,
  year: number,
): Promise<VolumeStats> {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year + 1, 0, 1);

  const [received, sent] = await Promise.all([
    prisma.emailMessage.count({
      where: {
        emailAccountId,
        date: { gte: startDate, lt: endDate },
        sent: false,
        draft: false,
      },
    }),
    prisma.emailMessage.count({
      where: {
        emailAccountId,
        date: { gte: startDate, lt: endDate },
        sent: true,
        draft: false,
      },
    }),
  ]);

  return {
    emailsReceived: received,
    emailsSent: sent,
    totalEmails: received + sent,
  };
}
