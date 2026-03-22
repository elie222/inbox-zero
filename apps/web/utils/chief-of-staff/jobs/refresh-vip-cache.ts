import prisma from "@/utils/prisma";
import { checkVipStatus } from "@/utils/chief-of-staff/vip/detector";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("chief-of-staff/jobs/refresh-vip-cache");

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export async function refreshVipCache(): Promise<number> {
  const cutoff = new Date(Date.now() - TWENTY_FOUR_HOURS_MS);

  const staleEntries = await prisma.vipCache.findMany({
    where: {
      lastChecked: { lt: cutoff },
    },
  });

  let refreshed = 0;

  for (const entry of staleEntries) {
    const log = logger.with({ clientEmail: entry.clientEmail });

    try {
      await checkVipStatus(entry.clientEmail, prisma);
      refreshed++;
    } catch (error) {
      log.error("Failed to refresh VIP cache entry", { error });
    }
  }

  return refreshed;
}
