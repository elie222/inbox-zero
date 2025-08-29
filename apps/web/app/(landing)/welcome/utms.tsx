import { cookies } from "next/headers";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("utms");

export async function fetchUserAndStoreUtms(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { utms: true },
  });

  if (user && !user.utms) {
    await storeUtms(userId).catch((error) => {
      logger.error("Failed to store utms", { error });
    });
  }
}

export async function storeUtms(userId: string) {
  logger.info("Storing utms", { userId });

  const cookieStore = await cookies();
  const utmCampaign = cookieStore.get("utm_campaign");
  const utmMedium = cookieStore.get("utm_medium");
  const utmSource = cookieStore.get("utm_source");
  const utmTerm = cookieStore.get("utm_term");
  const affiliate = cookieStore.get("affiliate");

  const utms = {
    utmCampaign: utmCampaign?.value,
    utmMedium: utmMedium?.value,
    utmSource: utmSource?.value,
    utmTerm: utmTerm?.value,
    affiliate: affiliate?.value,
  };

  await prisma.user.update({
    where: { id: userId },
    data: { utms },
  });

  logger.info("Stored utms", { utms, userId });
}
