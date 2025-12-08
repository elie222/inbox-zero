import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

const logger = createScopedLogger("utms");

type UtmValues = {
  utmCampaign?: string;
  utmMedium?: string;
  utmSource?: string;
  utmTerm?: string;
  affiliate?: string;
  referralCode?: string;
};

// Extract UTM values from cookies before passing to after() callback
// This is required because request APIs (cookies/headers) cannot be used
// inside after() in Server Components - only in Server Actions and Route Handlers
// See: https://nextjs.org/docs/app/api-reference/functions/after
export function extractUtmValues(cookies: ReadonlyRequestCookies): UtmValues {
  return {
    utmCampaign: cookies.get("utm_campaign")?.value,
    utmMedium: cookies.get("utm_medium")?.value,
    utmSource: cookies.get("utm_source")?.value,
    utmTerm: cookies.get("utm_term")?.value,
    affiliate: cookies.get("affiliate")?.value,
    referralCode: cookies.get("referral_code")?.value,
  };
}

export async function fetchUserAndStoreUtms(
  userId: string,
  utmValues: UtmValues,
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
    await storeUtms(userId, utmValues);
  }
}

async function storeUtms(userId: string, utmValues: UtmValues) {
  logger.info("Storing utms", { userId });

  const utms = {
    utmCampaign: utmValues.utmCampaign,
    utmMedium: utmValues.utmMedium,
    utmSource: utmValues.utmSource,
    utmTerm: utmValues.utmTerm,
    affiliate: utmValues.affiliate,
    referralCode: utmValues.referralCode,
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
