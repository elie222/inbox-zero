import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

const logger = createScopedLogger("utms");

export async function fetchUserAndStoreUtms(
  userId: string,
  cookies: ReadonlyRequestCookies,
) {
  const user = await prisma.user
    .findUnique({
      where: { id: userId },
      select: { utms: true },
    })
    .catch((error) => {
      logger.error("Failed to fetch user", { error, userId });
      return null;
    });

  if (user && !user.utms) {
    await storeUtms(userId, cookies);
  }
}

// `cookies` passed in as we can't do await cookies() in the `after` hook
async function storeUtms(userId: string, cookies: ReadonlyRequestCookies) {
  logger.info("Storing utms", { userId });

  const utmCampaign = cookies.get("utm_campaign");
  const utmMedium = cookies.get("utm_medium");
  const utmSource = cookies.get("utm_source");
  const utmTerm = cookies.get("utm_term");
  const affiliate = cookies.get("affiliate");

  const utms = {
    utmCampaign: utmCampaign?.value,
    utmMedium: utmMedium?.value,
    utmSource: utmSource?.value,
    utmTerm: utmTerm?.value,
    affiliate: affiliate?.value,
  };

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { utms },
    });

    logger.info("Stored utms", { utms, userId });
  } catch (error) {
    logger.error("Failed to store utms", { error, userId });
  }
}
